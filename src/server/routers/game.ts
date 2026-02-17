import { z } from "zod";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getOrSet } from "@/lib/redis";

const GAME_CACHE_TTL = 60; // 1 minute

/**
 * 生成随机 6 位数字游戏 ID (000000 - 999999)
 */
async function generateGameId(prisma: PrismaClient): Promise<string> {
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i++) {
    const randomNum = Math.floor(Math.random() * 1000000);
    const id = randomNum.toString().padStart(6, "0");

    const existing = await prisma.game.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return id;
    }
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "无法生成唯一游戏 ID，请稍后重试",
  });
}

import { GAME_TYPES } from "@/lib/constants";
export { GAME_TYPES };

export const gameRouter = router({
  /** 游戏列表（分页、标签筛选、搜索、排序） */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
        tagId: z.string().optional(),
        search: z.string().optional(),
        gameType: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes"]).default("latest"),
        timeRange: z.enum(["all", "today", "week", "month"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, search, gameType, sortBy, timeRange } = input;

      const getTimeFilter = () => {
        const now = new Date();
        switch (timeRange) {
          case "today":
            return new Date(now.setHours(0, 0, 0, 0));
          case "week":
            return new Date(now.setDate(now.getDate() - 7));
          case "month":
            return new Date(now.setMonth(now.getMonth() - 1));
          default:
            return undefined;
        }
      };
      const timeFilter = getTimeFilter();

      const baseWhere: Prisma.GameWhereInput = {
        status: "PUBLISHED",
      };

      if (tagId) {
        baseWhere.tags = { some: { tagId } };
      }

      if (search) {
        baseWhere.OR = [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ];
      }

      if (gameType) {
        baseWhere.gameType = gameType;
      }

      if (timeFilter) {
        baseWhere.createdAt = { gte: timeFilter };
      }

      const orderBy = {
        latest: { createdAt: "desc" as const },
        views: { views: "desc" as const },
        likes: { createdAt: "desc" as const },
      }[sortBy];

      const skip = (page - 1) * limit;

      const [games, totalCount] = await Promise.all([
        ctx.prisma.game.findMany({
          take: limit,
          skip,
          where: baseWhere,
          orderBy,
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            tags: {
              include: { tag: { select: { id: true, name: true, slug: true } } },
            },
            _count: { select: { likes: true, dislikes: true, comments: true, favorites: true } },
          },
        }),
        ctx.prisma.game.count({ where: baseWhere }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return { games, totalCount, totalPages, currentPage: page };
    }),

  /** 获取单个游戏详情 */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.prisma.game.findUnique({
        where: { id: input.id },
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: {
            select: { likes: true, dislikes: true, favorites: true, comments: true },
          },
        },
      });

      if (!game || (game.status !== "PUBLISHED" && game.uploaderId !== ctx.session?.user?.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
      }

      // 增加浏览量
      await ctx.prisma.game.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });

      return game;
    }),

  /** 获取热门游戏标签 */
  getPopularTags: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(30) }))
    .query(async ({ ctx, input }) => {
      return getOrSet(
        `game:popular-tags:${input.limit}`,
        async () => {
          return ctx.prisma.tag.findMany({
            where: {
              games: { some: { game: { status: "PUBLISHED" } } },
            },
            take: input.limit,
            orderBy: { games: { _count: "desc" } },
            select: { id: true, name: true, slug: true },
          });
        },
        GAME_CACHE_TTL * 5
      );
    }),

  /** 获取游戏类型统计 */
  getTypeStats: publicProcedure.query(async ({ ctx }) => {
    return getOrSet(
      "game:type-stats",
      async () => {
        const stats = await ctx.prisma.game.groupBy({
          by: ["gameType"],
          where: { status: "PUBLISHED" },
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
        });
        return stats.map((s) => ({
          type: s.gameType || "OTHER",
          count: s._count.id,
        }));
      },
      GAME_CACHE_TTL * 5
    );
  }),

  /** 获取相关游戏推荐 */
  getRelated: publicProcedure
    .input(z.object({
      gameId: z.string(),
      limit: z.number().min(1).max(20).default(6),
    }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.prisma.game.findUnique({
        where: { id: input.gameId },
        select: {
          gameType: true,
          tags: { select: { tagId: true } },
        },
      });

      if (!game) return [];

      const tagIds = game.tags.map((t) => t.tagId);

      return ctx.prisma.game.findMany({
        where: {
          id: { not: input.gameId },
          status: "PUBLISHED",
          OR: [
            ...(tagIds.length > 0 ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
            ...(game.gameType ? [{ gameType: game.gameType }] : []),
          ],
        },
        take: input.limit,
        orderBy: { views: "desc" },
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, dislikes: true, favorites: true } },
        },
      });
    }),

  /** 创建游戏（普通用户投稿） */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "请输入标题").max(200, "标题最多200字"),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        gameType: z.string().optional(),
        isFree: z.boolean().default(true),
        version: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
        extraInfo: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, tagNames, ...data } = input;

      // 检查投稿权限
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      }

      const isPrivileged = user.role === "ADMIN" || user.role === "OWNER";
      if (!isPrivileged && !user.canUpload) {
        throw new TRPCError({ code: "FORBIDDEN", message: "暂无投稿权限" });
      }

      const gameId = await generateGameId(ctx.prisma);

      // 处理标签
      const tagConnections: { tagId: string }[] = [];
      if (tagIds?.length) {
        for (const id of tagIds) {
          tagConnections.push({ tagId: id });
        }
      }
      if (tagNames?.length) {
        for (const tagName of tagNames) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");
          const tag = await ctx.prisma.tag.upsert({
            where: { slug },
            update: {},
            create: { name: tagName, slug },
          });
          tagConnections.push({ tagId: tag.id });
        }
      }

      // 管理员/站长直接发布，普通用户待审核
      const status = isPrivileged ? "PUBLISHED" : "PENDING";

      const game = await ctx.prisma.game.create({
        data: {
          id: gameId,
          title: data.title,
          description: data.description || null,
          coverUrl: data.coverUrl || null,
          gameType: data.gameType || null,
          isFree: data.isFree,
          version: data.version || null,
          extraInfo: data.extraInfo || undefined,
          status,
          uploaderId: ctx.session.user.id,
          tags: {
            create: tagConnections,
          },
        },
      });

      return { id: game.id, status: game.status };
    }),

  /** 批量创建游戏 */
  batchCreate: protectedProcedure
    .input(
      z.object({
        games: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              description: z.string().max(5000).optional(),
              coverUrl: z.string().url().optional().or(z.literal("")),
              gameType: z.string().optional(),
              isFree: z.boolean().default(true),
              version: z.string().optional(),
              tagNames: z.array(z.string()).optional(),
              extraInfo: z.any().optional(),
            })
          )
          .min(1)
          .max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 检查投稿权限
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      }
      const isPrivileged = user.role === "ADMIN" || user.role === "OWNER";
      if (!isPrivileged && !user.canUpload) {
        throw new TRPCError({ code: "FORBIDDEN", message: "暂无投稿权限" });
      }

      const status = isPrivileged ? "PUBLISHED" : "PENDING";

      // 批量预处理标签
      const allTagNames = new Set<string>();
      for (const g of input.games) {
        for (const t of g.tagNames ?? []) allTagNames.add(t);
      }
      const tagNameToId = new Map<string, string>();
      if (allTagNames.size > 0) {
        await Promise.all(
          [...allTagNames].map(async (tagName) => {
            const slug =
              tagName
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`;
            try {
              const tag = await ctx.prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName, slug },
              });
              tagNameToId.set(tagName, tag.id);
            } catch {
              const existing = await ctx.prisma.tag.findFirst({
                where: { OR: [{ name: tagName }, { slug }] },
              });
              if (existing) tagNameToId.set(tagName, existing.id);
            }
          })
        );
      }

      // 逐条创建或更新（按标题去重）
      const results: { title: string; id?: string; error?: string; updated?: boolean }[] = [];

      for (const gameInput of input.games) {
        try {
          const tagIds = (gameInput.tagNames ?? [])
            .map((n) => tagNameToId.get(n))
            .filter((id): id is string => !!id);

          // 查找是否存在同名游戏
          const existing = await ctx.prisma.game.findFirst({
            where: { title: gameInput.title },
            select: { id: true },
          });

          if (existing) {
            // 更新已有游戏
            await ctx.prisma.tagOnGame.deleteMany({
              where: { gameId: existing.id },
            });

            await ctx.prisma.game.update({
              where: { id: existing.id },
              data: {
                description: gameInput.description || null,
                coverUrl: gameInput.coverUrl || null,
                gameType: gameInput.gameType || null,
                isFree: gameInput.isFree,
                version: gameInput.version || null,
                extraInfo: gameInput.extraInfo || undefined,
                tags: {
                  create: tagIds.map((tagId) => ({ tagId })),
                },
              },
            });

            results.push({ title: gameInput.title, id: existing.id, updated: true });
          } else {
            // 创建新游戏
            const gameId = await generateGameId(ctx.prisma);

            await ctx.prisma.game.create({
              data: {
                id: gameId,
                title: gameInput.title,
                description: gameInput.description || null,
                coverUrl: gameInput.coverUrl || null,
                gameType: gameInput.gameType || null,
                isFree: gameInput.isFree,
                version: gameInput.version || null,
                extraInfo: gameInput.extraInfo || undefined,
                status,
                uploaderId: ctx.session.user.id,
                tags: {
                  create: tagIds.map((tagId) => ({ tagId })),
                },
              },
            });

            results.push({ title: gameInput.title, id: gameId });
          }
        } catch (err) {
          results.push({
            title: gameInput.title,
            error: err instanceof Error ? err.message : "未知错误",
          });
        }
      }

      return { results };
    }),

  /** 切换收藏 */
  toggleFavorite: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.prisma.gameFavorite.findUnique({
        where: { userId_gameId: { userId, gameId: input.gameId } },
      });

      if (existing) {
        await ctx.prisma.gameFavorite.delete({ where: { id: existing.id } });
        return { favorited: false };
      } else {
        await ctx.prisma.gameFavorite.create({
          data: { userId, gameId: input.gameId },
        });
        return { favorited: true };
      }
    }),

  /** 切换点赞/点踩 */
  toggleReaction: protectedProcedure
    .input(z.object({
      gameId: z.string(),
      type: z.enum(["like", "dislike"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { gameId, type } = input;

      if (type === "like") {
        const existing = await ctx.prisma.gameLike.findUnique({
          where: { userId_gameId: { userId, gameId } },
        });
        if (existing) {
          await ctx.prisma.gameLike.delete({ where: { id: existing.id } });
          return { liked: false, disliked: false };
        }
        await ctx.prisma.$transaction([
          ctx.prisma.gameLike.create({ data: { userId, gameId } }),
          ctx.prisma.gameDislike.deleteMany({ where: { userId, gameId } }),
        ]);
        return { liked: true, disliked: false };
      } else {
        const existing = await ctx.prisma.gameDislike.findUnique({
          where: { userId_gameId: { userId, gameId } },
        });
        if (existing) {
          await ctx.prisma.gameDislike.delete({ where: { id: existing.id } });
          return { liked: false, disliked: false };
        }
        await ctx.prisma.$transaction([
          ctx.prisma.gameDislike.create({ data: { userId, gameId } }),
          ctx.prisma.gameLike.deleteMany({ where: { userId, gameId } }),
        ]);
        return { liked: false, disliked: true };
      }
    }),

  /** 检查用户交互状态 */
  getUserInteraction: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [liked, disliked, favorited] = await Promise.all([
        ctx.prisma.gameLike.findUnique({
          where: { userId_gameId: { userId, gameId: input.gameId } },
        }),
        ctx.prisma.gameDislike.findUnique({
          where: { userId_gameId: { userId, gameId: input.gameId } },
        }),
        ctx.prisma.gameFavorite.findUnique({
          where: { userId_gameId: { userId, gameId: input.gameId } },
        }),
      ]);
      return {
        liked: !!liked,
        disliked: !!disliked,
        favorited: !!favorited,
      };
    }),
});
