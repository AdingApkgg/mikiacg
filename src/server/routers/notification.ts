import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const notificationTypeSchema = z.enum([
  "COMMENT_REPLY",
  "LIKE",
  "FAVORITE",
  "SYSTEM",
  "NEW_MESSAGE",
  "CONTENT_STATUS",
  "FOLLOW",
]);

export const notificationRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        type: z
          .enum([
            "COMMENT_REPLY",
            "LIKE",
            "FAVORITE",
            "SYSTEM",
            "NEW_MESSAGE",
            "CONTENT_STATUS",
            "FOLLOW",
            "TICKET_UPDATE",
          ])
          .optional(),
        unreadOnly: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit, type, unreadOnly } = input;
      const userId = ctx.session.user.id;

      const notifications = await ctx.prisma.notification.findMany({
        where: {
          userId,
          ...(type ? { type } : {}),
          ...(unreadOnly ? { isRead: false } : {}),
        },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (notifications.length > limit) {
        const next = notifications.pop();
        nextCursor = next?.id;
      }

      return { notifications, nextCursor };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.notification.count({
      where: { userId: ctx.session.user.id, isRead: false },
    });
    return count;
  }),

  markAsRead: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        all: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (input.all) {
        await ctx.prisma.notification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true },
        });
      } else if (input.id) {
        await ctx.prisma.notification.updateMany({
          where: { id: input.id, userId },
          data: { isRead: true },
        });
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must provide id or set all=true",
        });
      }

      return { success: true };
    }),

  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.notification.deleteMany({
      where: { id: input.id, userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  deleteAll: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.notification.deleteMany({
      where: { userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  // 批量删除指定 ID 的通知
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.notification.deleteMany({
        where: { id: { in: input.ids }, userId: ctx.session.user.id },
      });
      return { success: true, count: result.count };
    }),

  // 按类型标记已读
  markAllAsReadByType: protectedProcedure
    .input(z.object({ type: notificationTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.notification.updateMany({
        where: { userId: ctx.session.user.id, type: input.type, isRead: false },
        data: { isRead: true },
      });
      return { success: true, count: result.count };
    }),

  // 按类型删除已读的通知（清理）
  clearReadByType: protectedProcedure
    .input(z.object({ type: notificationTypeSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.notification.deleteMany({
        where: {
          userId: ctx.session.user.id,
          isRead: true,
          ...(input.type ? { type: input.type } : {}),
        },
      });
      return { success: true, count: result.count };
    }),

  // 按类型统计未读数
  unreadCountByType: protectedProcedure.query(async ({ ctx }) => {
    const grouped = await ctx.prisma.notification.groupBy({
      by: ["type"],
      where: { userId: ctx.session.user.id, isRead: false },
      _count: { _all: true },
    });

    const counts = {
      COMMENT_REPLY: 0,
      LIKE: 0,
      FAVORITE: 0,
      SYSTEM: 0,
      NEW_MESSAGE: 0,
      CONTENT_STATUS: 0,
      FOLLOW: 0,
      TICKET_UPDATE: 0,
    } as Record<string, number>;

    let total = 0;
    for (const g of grouped) {
      counts[g.type] = g._count._all;
      total += g._count._all;
    }

    return { total, counts };
  }),

  // 查询单条通知
  getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const notification = await ctx.prisma.notification.findFirst({
      where: { id: input.id, userId: ctx.session.user.id },
    });
    if (!notification) {
      throw new TRPCError({ code: "NOT_FOUND", message: "通知不存在" });
    }
    return notification;
  }),
});
