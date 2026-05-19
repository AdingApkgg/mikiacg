import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, requireScope } from "../../trpc";
import { Prisma } from "@/generated/prisma/client";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  adminReplyTicketInputSchema,
  updateTicketAdminInputSchema,
} from "@/lib/ticket-schema";
import { createNotification } from "@/lib/notification";

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

const ticketProcedure = adminProcedure.use(requireScope("ticket:manage"));

export const adminTicketsRouter = router({
  /** 管理后台列表 */
  listTickets: ticketProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(TICKET_STATUSES).optional(),
        category: z.enum(TICKET_CATEGORIES).optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        assigneeId: z.string().nullable().optional(),
        search: z.string().max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.TicketWhereInput = {
        ...(input.status ? { status: input.status } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assigneeId === null
          ? { assigneeId: null }
          : input.assigneeId
            ? { assigneeId: input.assigneeId }
            : {}),
        ...(input.search
          ? {
              OR: [
                { title: { contains: input.search, mode: "insensitive" } },
                { content: { contains: input.search, mode: "insensitive" } },
                {
                  user: {
                    OR: [
                      { username: { contains: input.search, mode: "insensitive" } },
                      { nickname: { contains: input.search, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      };

      const [tickets, totalCount] = await Promise.all([
        ctx.prisma.ticket.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          orderBy: [{ lastReplyAt: "desc" }, { createdAt: "desc" }],
          include: ticketIncludeForList,
        }),
        ctx.prisma.ticket.count({ where }),
      ]);

      return {
        tickets,
        totalCount,
        totalPages: Math.ceil(totalCount / input.limit),
        currentPage: input.page,
      };
    }),

  /** 管理后台统计（首页卡片用） */
  stats: ticketProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.prisma.ticket.groupBy({
      by: ["status"],
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

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const todayCount = await ctx.prisma.ticket.count({ where: { createdAt: { gte: since } } });

    return { total, counts, todayCount };
  }),

  /** 工单详情（含全部回复，含内部备注） */
  getTicketById: ticketProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.id },
      include: {
        user: { select: ticketUserSelect },
        assignee: { select: ticketUserSelect },
        replies: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: ticketUserSelect } },
        },
      },
    });

    if (!ticket) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    // 同时返回提交人累计工单数
    const userTicketCount = await ctx.prisma.ticket.count({ where: { userId: ticket.userId } });

    return { ticket, userTicketCount };
  }),

  /** 管理员回复（对外或内部备注） */
  replyTicket: ticketProcedure.input(adminReplyTicketInputSchema).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, userId: true, status: true, title: true, assigneeId: true },
    });

    if (!ticket) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    const adminId = ctx.session.user.id;
    const now = new Date();

    // 对外回复时,若工单仍为待处理则升级为处理中
    const nextStatus = !input.isInternal && ticket.status === "PENDING" ? ("IN_PROGRESS" as const) : ticket.status;

    await ctx.prisma.$transaction([
      ctx.prisma.ticketReply.create({
        data: {
          ticketId: input.ticketId,
          userId: adminId,
          content: input.content.trim(),
          attachments: (input.attachments as Prisma.InputJsonValue | undefined) ?? undefined,
          isStaff: true,
          isInternal: input.isInternal,
        },
      }),
      ctx.prisma.ticket.update({
        where: { id: input.ticketId },
        data: {
          status: nextStatus,
          ...(input.isInternal ? {} : { lastReplyAt: now }),
          ...(ticket.assigneeId ? {} : { assigneeId: adminId }),
        },
      }),
    ]);

    // 对外回复通知用户
    if (!input.isInternal && ticket.userId !== adminId) {
      try {
        await createNotification({
          userId: ticket.userId,
          type: "TICKET_UPDATE",
          title: "工单有新回复",
          content: ticket.title,
          data: { ticketId: ticket.id, kind: "staff_reply" },
        });
      } catch {
        // ignore
      }
    }

    return { success: true };
  }),

  /** 更新工单：状态 / 优先级 / 分配人 */
  updateTicket: ticketProcedure.input(updateTicketAdminInputSchema).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
        userId: true,
        status: true,
        priority: true,
        assigneeId: true,
        title: true,
      },
    });

    if (!ticket) {
      throw new TRPCError({ code: "NOT_FOUND", message: "工单不存在" });
    }

    const adminId = ctx.session.user.id;
    const data: Prisma.TicketUpdateInput = {};
    const systemMessages: string[] = [];
    const now = new Date();

    if (input.status && input.status !== ticket.status) {
      data.status = input.status;
      if (input.status === "RESOLVED") data.resolvedAt = now;
      if (input.status === "CLOSED") data.closedAt = now;
      systemMessages.push(`状态变更:${ticket.status} → ${input.status}`);
    }

    if (input.priority && input.priority !== ticket.priority) {
      data.priority = input.priority;
      systemMessages.push(`优先级变更:${ticket.priority} → ${input.priority}`);
    }

    if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
      data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
      systemMessages.push(input.assigneeId ? "已分配处理人" : "已取消分配");
    }

    if (Object.keys(data).length === 0) {
      return { success: true };
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [ctx.prisma.ticket.update({ where: { id: input.ticketId }, data })];

    for (const msg of systemMessages) {
      ops.push(
        ctx.prisma.ticketReply.create({
          data: {
            ticketId: input.ticketId,
            userId: adminId,
            content: msg,
            isSystem: true,
            isStaff: true,
          },
        }),
      );
    }

    await ctx.prisma.$transaction(ops);

    // 通知用户状态变更
    if (input.status && ticket.userId !== adminId) {
      try {
        await createNotification({
          userId: ticket.userId,
          type: "TICKET_UPDATE",
          title: "工单状态更新",
          content: `${ticket.title} → ${input.status}`,
          data: { ticketId: ticket.id, kind: "status_change", status: input.status },
        });
      } catch {
        // ignore
      }
    }

    return { success: true };
  }),

  /** 删除工单（硬删除，慎用） */
  deleteTicket: ticketProcedure.input(z.object({ ticketId: z.string().cuid() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.ticket.delete({ where: { id: input.ticketId } });
    return { success: true };
  }),

  /** 候选处理人列表（有 ticket:manage 权限的管理员） */
  assigneeOptions: ticketProcedure.query(async ({ ctx }) => {
    const admins = await ctx.prisma.user.findMany({
      where: {
        OR: [{ role: "OWNER" }, { role: "ADMIN" }],
        isBanned: false,
      },
      select: { id: true, username: true, nickname: true, avatar: true, role: true },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
      take: 50,
    });
    return admins;
  }),
});
