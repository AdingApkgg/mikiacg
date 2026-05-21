import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, requireScope } from "../../trpc";
import { Prisma } from "@/generated/prisma/client";
import {
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
  adminReplyTicketInputSchema,
  updateTicketAdminInputSchema,
} from "@/lib/ticket-schema";
import { createNotification } from "@/lib/notification";
import { sendTicketUpdateEmail } from "@/lib/ticket-email";

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
        duplicateOf: { select: { id: true, title: true, status: true } },
        duplicates: { select: { id: true, title: true, createdAt: true, user: { select: ticketUserSelect } } },
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

    // 对外回复通知用户 + 邮件
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
      // 邮件异步发送,不阻塞
      void sendTicketUpdateEmail({
        userId: ticket.userId,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        kind: "staff_reply",
        replyPreview: input.content.trim().slice(0, 200),
      });
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

    // 通知用户状态变更 + 邮件 (仅关键状态:RESOLVED / WAITING_USER / CLOSED)
    if (input.status && ticket.userId !== adminId) {
      try {
        await createNotification({
          userId: ticket.userId,
          type: "TICKET_UPDATE",
          title: "工单状态更新",
          content: `${ticket.title} → ${TICKET_STATUS_LABELS[input.status]}`,
          data: { ticketId: ticket.id, kind: "status_change", status: input.status },
        });
      } catch {
        // ignore
      }
      // 仅在解决/等待用户/关闭时发邮件,避免过于频繁
      if (input.status === "RESOLVED" || input.status === "WAITING_USER" || input.status === "CLOSED") {
        void sendTicketUpdateEmail({
          userId: ticket.userId,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          kind: "status_change",
          statusLabel: TICKET_STATUS_LABELS[input.status],
        });
      }
    }

    return { success: true };
  }),

  /** 删除工单（硬删除，慎用） */
  deleteTicket: ticketProcedure.input(z.object({ ticketId: z.string().cuid() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.ticket.delete({ where: { id: input.ticketId } });
    return { success: true };
  }),

  /** 批量操作:状态/优先级/分配人/删除 */
  batchUpdate: ticketProcedure
    .input(
      z.object({
        ticketIds: z.array(z.string().cuid()).min(1).max(200),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("status"), value: z.enum(TICKET_STATUSES) }),
          z.object({ type: z.literal("priority"), value: z.enum(TICKET_PRIORITIES) }),
          z.object({ type: z.literal("assignee"), value: z.string().nullable() }),
          z.object({ type: z.literal("delete") }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { ticketIds, action } = input;
      const adminId = ctx.session.user.id;
      const now = new Date();

      if (action.type === "delete") {
        const result = await ctx.prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
        return { success: true, affected: result.count };
      }

      // 改状态/优先级/分配人:先读出原值用于通知 + 系统消息
      const tickets = await ctx.prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, userId: true, status: true, priority: true, assigneeId: true, title: true },
      });

      const ops: Prisma.PrismaPromise<unknown>[] = [];
      const notifyUserIds: { userId: string; ticketId: string; title: string }[] = [];
      let systemMessage = "";

      if (action.type === "status") {
        const data: Prisma.TicketUpdateManyArgs["data"] = { status: action.value };
        if (action.value === "RESOLVED") data.resolvedAt = now;
        if (action.value === "CLOSED") data.closedAt = now;
        ops.push(ctx.prisma.ticket.updateMany({ where: { id: { in: ticketIds } }, data }));
        systemMessage = `批量变更状态 → ${action.value}`;

        for (const t of tickets) {
          if (t.status !== action.value && t.userId !== adminId) {
            notifyUserIds.push({ userId: t.userId, ticketId: t.id, title: t.title });
          }
        }
      } else if (action.type === "priority") {
        ops.push(
          ctx.prisma.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: { priority: action.value },
          }),
        );
        systemMessage = `批量变更优先级 → ${action.value}`;
      } else if (action.type === "assignee") {
        ops.push(
          ctx.prisma.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: { assigneeId: action.value },
          }),
        );
        systemMessage = action.value ? "批量分配处理人" : "批量取消分配";
      }

      // 给每条工单插入系统消息
      ops.push(
        ctx.prisma.ticketReply.createMany({
          data: ticketIds.map((id) => ({
            ticketId: id,
            userId: adminId,
            content: systemMessage,
            isSystem: true,
            isStaff: true,
          })),
        }),
      );

      await ctx.prisma.$transaction(ops);

      // 状态变更通知用户(异步,不影响主流程)
      if (notifyUserIds.length > 0 && action.type === "status") {
        const status = action.value;
        Promise.all(
          notifyUserIds.map((n) =>
            createNotification({
              userId: n.userId,
              type: "TICKET_UPDATE",
              title: "工单状态更新",
              content: `${n.title} → ${status}`,
              data: { ticketId: n.ticketId, kind: "status_change", status },
            }).catch(() => {}),
          ),
        ).catch(() => {});
      }

      return { success: true, affected: tickets.length };
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

  /** 导出工单 CSV(返回行数据,客户端生成 CSV 文件) */
  exportTickets: ticketProcedure
    .input(
      z.object({
        status: z.enum(TICKET_STATUSES).optional(),
        category: z.enum(TICKET_CATEGORIES).optional(),
        priority: z.enum(TICKET_PRIORITIES).optional(),
        assigneeId: z.string().nullable().optional(),
        search: z.string().max(100).optional(),
        limit: z.number().min(1).max(5000).default(5000),
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
              ],
            }
          : {}),
      };

      const tickets = await ctx.prisma.ticket.findMany({
        where,
        take: input.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          category: true,
          status: true,
          priority: true,
          title: true,
          createdAt: true,
          lastReplyAt: true,
          resolvedAt: true,
          closedAt: true,
          duplicateOfId: true,
          user: { select: { username: true, nickname: true } },
          assignee: { select: { username: true, nickname: true } },
          _count: { select: { replies: true } },
        },
      });

      return tickets;
    }),

  /** 工单搜索(用于合并对话框) */
  searchForMerge: ticketProcedure
    .input(z.object({ excludeId: z.string().cuid(), search: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const tickets = await ctx.prisma.ticket.findMany({
        where: {
          id: { not: input.excludeId },
          duplicateOfId: null, // 不能合并到已经是重复的工单
          OR: [
            { id: { contains: input.search, mode: "insensitive" } },
            { title: { contains: input.search, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          category: true,
          createdAt: true,
          user: { select: { username: true, nickname: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return tickets;
    }),

  /** 合并工单:source → target,source 标记为重复并关闭 */
  mergeTicket: ticketProcedure
    .input(
      z.object({
        sourceId: z.string().cuid(),
        targetId: z.string().cuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能合并到自身" });
      }

      const [source, target] = await Promise.all([
        ctx.prisma.ticket.findUnique({
          where: { id: input.sourceId },
          select: { id: true, userId: true, title: true, status: true, duplicateOfId: true },
        }),
        ctx.prisma.ticket.findUnique({
          where: { id: input.targetId },
          select: { id: true, title: true, duplicateOfId: true },
        }),
      ]);

      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "源工单不存在" });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "目标工单不存在" });
      if (source.duplicateOfId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "源工单已被合并" });
      }
      if (target.duplicateOfId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "目标工单本身已被合并,请选择主工单" });
      }

      const adminId = ctx.session.user.id;
      const now = new Date();

      await ctx.prisma.$transaction([
        // 标记源工单为重复 + 关闭
        ctx.prisma.ticket.update({
          where: { id: source.id },
          data: {
            duplicateOfId: target.id,
            status: "CLOSED",
            closedAt: now,
            lastReplyAt: now,
          },
        }),
        // 源工单时间线插入合并消息
        ctx.prisma.ticketReply.create({
          data: {
            ticketId: source.id,
            userId: adminId,
            content: `已合并到工单「${target.title}」(#${target.id.slice(-8)})`,
            isSystem: true,
            isStaff: true,
          },
        }),
        // 目标工单时间线插入合并消息
        ctx.prisma.ticketReply.create({
          data: {
            ticketId: target.id,
            userId: adminId,
            content: `合并了重复工单「${source.title}」(#${source.id.slice(-8)})`,
            isSystem: true,
            isStaff: true,
          },
        }),
        ctx.prisma.ticket.update({
          where: { id: target.id },
          data: { lastReplyAt: now },
        }),
      ]);

      // 通知源工单提交人 + 邮件
      if (source.userId !== adminId) {
        try {
          await createNotification({
            userId: source.userId,
            type: "TICKET_UPDATE",
            title: "工单已合并",
            content: `${source.title} 已合并到其他工单`,
            data: { ticketId: target.id, kind: "merged" },
          });
        } catch {
          // ignore
        }
        void sendTicketUpdateEmail({
          userId: source.userId,
          ticketId: target.id,
          ticketTitle: source.title,
          kind: "merged",
        });
      }

      return { success: true, targetId: target.id };
    }),
});
