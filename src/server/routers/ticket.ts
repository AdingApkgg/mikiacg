import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { Prisma } from "@/generated/prisma/client";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  createTicketInputSchema,
  replyTicketInputSchema,
  validateTicketMetadata,
  type TicketCategoryKey,
} from "@/lib/ticket-schema";
import { createNotification } from "@/lib/notification";
import { redisIncr, REDIS_AVAILABLE } from "@/lib/redis";

const RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const RATE_LIMIT_MAX = 3;

const ticketUserSelect = {
  id: true,
  username: true,
  nickname: true,
  avatar: true,
  role: true,
} as const;

const ticketIncludeForList = {
  user: { select: ticketUserSelect },
  assignee: { select: ticketUserSelect },
  _count: { select: { replies: true } },
} satisfies Prisma.TicketInclude;

export const ticketRouter = router({
  /** 创建工单 */
  create: protectedProcedure.input(createTicketInputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // 简单限流：单用户 5 分钟最多 3 条
    if (REDIS_AVAILABLE) {
      try {
        const count = await redisIncr(`ticket_rate:${userId}`, RATE_LIMIT_WINDOW_SECONDS);
        if (count > RATE_LIMIT_MAX) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `提交太频繁，请稍后再试（${RATE_LIMIT_WINDOW_SECONDS / 60} 分钟内最多 ${RATE_LIMIT_MAX} 条）`,
          });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
      }
    }

    // 按分类校验 metadata
    let metadata: unknown;
    try {
      metadata = validateTicketMetadata(input.category as TicketCategoryKey, input.metadata);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err instanceof Error ? err.message : "分类信息格式有误",
      });
    }

    const ticket = await ctx.prisma.ticket.create({
      data: {
        userId,
        category: input.category,
        priority: input.priority,
        title: input.title.trim(),
        content: input.content.trim(),
        attachments: (input.attachments as Prisma.InputJsonValue | undefined) ?? undefined,
        metadata: (metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        lastReplyAt: new Date(),
      },
      select: { id: true },
    });

    return { id: ticket.id };
  }),

  /** 我的工单列表 */
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        status: z.enum(TICKET_STATUSES).optional(),
        category: z.enum(TICKET_CATEGORIES).optional(),
        search: z.string().max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TicketWhereInput = {
        userId: ctx.session.user.id,
        ...(input.status ? { status: input.status } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: "insensitive" } },
                { content: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const tickets = await ctx.prisma.ticket.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ lastReplyAt: "desc" }, { createdAt: "desc" }],
        include: ticketIncludeForList,
      });

      let nextCursor: string | undefined;
      if (tickets.length > input.limit) {
        const next = tickets.pop();
        nextCursor = next?.id;
      }

      return { tickets, nextCursor };
    }),

  /** 各状态工单数（用于 tab 角标） */
  myStats: protectedProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.prisma.ticket.groupBy({
      by: ["status"],
      where: { userId: ctx.session.user.id },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<
      (typeof TICKET_STATUSES)[number],
      number
    >;
    let total = 0;
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      total += g._count._all;
    }
    return { total, counts };
  }),

  /** 工单详情（含回复，仅本人） */
  getById: protectedProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.id },
      include: {
        user: { select: ticketUserSelect },
        assignee: { select: ticketUserSelect },
        replies: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          include: { user: { select: ticketUserSelect } },
        },
      },
    });

    if (!ticket || ticket.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    return ticket;
  }),

  /** 用户回复工单 */
  reply: protectedProcedure.input(replyTicketInputSchema).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, userId: true, status: true, assigneeId: true, title: true },
    });

    if (!ticket || ticket.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    if (ticket.status === "CLOSED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "工单已关闭，无法回复" });
    }

    const now = new Date();
    const nextStatus = ticket.status === "WAITING_USER" ? "IN_PROGRESS" : ticket.status;

    await ctx.prisma.$transaction([
      ctx.prisma.ticketReply.create({
        data: {
          ticketId: input.ticketId,
          userId: ctx.session.user.id,
          content: input.content.trim(),
          attachments: (input.attachments as Prisma.InputJsonValue | undefined) ?? undefined,
          isStaff: false,
        },
      }),
      ctx.prisma.ticket.update({
        where: { id: input.ticketId },
        data: { lastReplyAt: now, status: nextStatus },
      }),
    ]);

    // 通知分配人有新回复（如果有）
    if (ticket.assigneeId && ticket.assigneeId !== ctx.session.user.id) {
      try {
        await createNotification({
          userId: ticket.assigneeId,
          type: "TICKET_UPDATE",
          title: "工单有新回复",
          content: ticket.title,
          data: { ticketId: ticket.id, kind: "user_reply" },
        });
      } catch {
        // 通知失败不影响主流程
      }
    }

    return { success: true };
  }),

  /** 用户主动关闭工单 */
  close: protectedProcedure.input(z.object({ ticketId: z.string().cuid() })).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: { userId: true, status: true },
    });

    if (!ticket || ticket.userId !== ctx.session.user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    if (ticket.status === "CLOSED") {
      return { success: true };
    }

    const now = new Date();
    await ctx.prisma.$transaction([
      ctx.prisma.ticket.update({
        where: { id: input.ticketId },
        data: { status: "CLOSED", closedAt: now, lastReplyAt: now },
      }),
      ctx.prisma.ticketReply.create({
        data: {
          ticketId: input.ticketId,
          userId: ctx.session.user.id,
          content: "用户主动关闭工单",
          isSystem: true,
          isStaff: false,
        },
      }),
    ]);

    return { success: true };
  }),
});
