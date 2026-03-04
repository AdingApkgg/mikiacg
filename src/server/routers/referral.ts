import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { awardDailyLogin } from "@/lib/points";
import { redis } from "@/lib/redis";

async function generateUniqueCode(
  prisma: typeof import("@/lib/prisma").prisma
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = nanoid(8);
    const existing = await prisma.referralLink.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "无法生成唯一推广码" });
}

export const referralRouter = router({
  // ========== 用户端 ==========

  getMyStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const today = new Date().toISOString().slice(0, 10);
    const dailyClickKey = `ref_daily_clicks:${userId}:${today}`;

    const [user, linkCount, todayClicksStr] = await Promise.all([
      ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          points: true,
          referralCode: true,
          _count: { select: { referralsMade: true, referralLinks: true } },
        },
      }),
      ctx.prisma.referralLink.count({ where: { userId } }),
      redis.get(dailyClickKey).catch(() => null),
    ]);

    const todayClicks = todayClicksStr ? parseInt(todayClicksStr, 10) : 0;

    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    return {
      points: user.points,
      referralCode: user.referralCode,
      totalReferrals: user._count.referralsMade,
      totalLinks: linkCount,
      todayClicks,
    };
  }),

  ensureReferralCode: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = await ctx.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (user?.referralCode) return { code: user.referralCode };

    const code = nanoid(8);
    const updated = await ctx.prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
      select: { referralCode: true },
    });

    return { code: updated.referralCode! };
  }),

  getMyLinks: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { limit, page } = input;

      const [links, totalCount] = await Promise.all([
        ctx.prisma.referralLink.findMany({
          where: { userId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.referralLink.count({ where: { userId } }),
      ]);

      return {
        links,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  createLink: protectedProcedure
    .input(
      z.object({
        label: z.string().max(100).optional(),
        channel: z.string().max(50).optional(),
        targetUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const siteConfig = await ctx.prisma.siteConfig.findUnique({
        where: { id: "default" },
        select: { referralEnabled: true, referralMaxLinksPerUser: true },
      });

      if (!siteConfig?.referralEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "推广系统未启用" });
      }

      const currentCount = await ctx.prisma.referralLink.count({ where: { userId } });
      if (currentCount >= (siteConfig.referralMaxLinksPerUser || 20)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `推广链接数量已达上限（${siteConfig.referralMaxLinksPerUser}）`,
        });
      }

      const code = await generateUniqueCode(ctx.prisma);

      const link = await ctx.prisma.referralLink.create({
        data: {
          userId,
          code,
          label: input.label || null,
          channel: input.channel || null,
          targetUrl: input.targetUrl || null,
        },
      });

      return link;
    }),

  updateLink: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().max(100).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.prisma.referralLink.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!link || link.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "推广链接不存在" });
      }

      const data: Record<string, unknown> = {};
      if (input.label !== undefined) data.label = input.label || null;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      return ctx.prisma.referralLink.update({
        where: { id: input.id },
        data,
      });
    }),

  deleteLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.prisma.referralLink.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!link || link.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "推广链接不存在" });
      }

      await ctx.prisma.referralLink.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getMyReferrals: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { limit, page } = input;

      const [records, totalCount] = await Promise.all([
        ctx.prisma.referralRecord.findMany({
          where: { referrerId: userId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            referredUser: {
              select: { id: true, username: true, nickname: true, avatar: true, createdAt: true },
            },
            referralLink: {
              select: { code: true, label: true, channel: true },
            },
          },
        }),
        ctx.prisma.referralRecord.count({ where: { referrerId: userId } }),
      ]);

      return {
        records,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  getPointsHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { limit, page } = input;

      const [transactions, totalCount] = await Promise.all([
        ctx.prisma.pointsTransaction.findMany({
          where: { userId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.pointsTransaction.count({ where: { userId } }),
      ]);

      return {
        transactions,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  claimDailyLogin: protectedProcedure.mutation(async ({ ctx }) => {
    const points = await awardDailyLogin(ctx.session.user.id);
    return { awarded: points > 0, points };
  }),

  // ========== 管理端 ==========

  adminGetOverview: adminProcedure.query(async ({ ctx }) => {
    const [totalReferrals, totalLinks, totalPointsAwarded, todayReferrals] = await Promise.all([
      ctx.prisma.referralRecord.count(),
      ctx.prisma.referralLink.count(),
      ctx.prisma.referralRecord.aggregate({ _sum: { pointsAwarded: true } }),
      ctx.prisma.referralRecord.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);

    return {
      totalReferrals,
      totalLinks,
      totalPointsAwarded: totalPointsAwarded._sum.pointsAwarded || 0,
      todayReferrals,
    };
  }),

  adminGetTopReferrers: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const top = await ctx.prisma.referralRecord.groupBy({
        by: ["referrerId"],
        _count: { id: true },
        _sum: { pointsAwarded: true },
        orderBy: { _count: { id: "desc" } },
        take: input.limit,
      });

      const userIds = top.map((t) => t.referrerId);
      const users = await ctx.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true, avatar: true },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));

      return top.map((t) => ({
        user: userMap.get(t.referrerId) || { id: t.referrerId, username: "unknown", nickname: null, avatar: null },
        referralCount: t._count.id,
        totalPoints: t._sum.pointsAwarded || 0,
      }));
    }),

  adminAdjustPoints: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().int(),
        description: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const newBalance = await ctx.prisma.$transaction(async (tx) => {
        const targetUser = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, points: true },
        });

        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        }

        if (targetUser.points + input.amount < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "调整后积分不能为负数" });
        }

        const updated = await tx.user.update({
          where: { id: input.userId },
          data: { points: { increment: input.amount } },
          select: { points: true },
        });

        await tx.pointsTransaction.create({
          data: {
            userId: input.userId,
            amount: input.amount,
            balance: updated.points,
            type: "ADMIN_ADJUST",
            description: input.description || `管理员手动调整 ${input.amount > 0 ? "+" : ""}${input.amount}`,
          },
        });

        return updated.points;
      });

      return { success: true, newBalance };
    }),
});
