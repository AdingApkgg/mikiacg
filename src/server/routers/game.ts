import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { memGetOrSet } from "@/lib/memory-cache";
import { redisSetNX } from "@/lib/redis";
import { checkViewDedup } from "@/lib/view-dedup";
import { submitGameToIndexNow, submitGamesToIndexNow } from "@/lib/indexnow";
import { awardPoints } from "@/lib/points";
import {
  generateContentId,
  resolveAllTagIds,
  resolveTagNames,
  resolvePublishStatus,
  assertCanUpload,
  assertBatchLimit,
  assertOwnership,
  scheduleTagCountRefresh,
} from "@/server/publish-utils";
import { meili, INDEX, safeSync } from "@/lib/meilisearch";
import { syncGame, deleteGame } from "@/lib/search-sync";
import { shouldMeiliListSearch, gameListMeiliFilter, gameListMeiliSort } from "@/lib/meili-filters";
import {
  addWhereAnd,
  gamePublicationDateWhere,
  gamePublicationOrderBy,
  shouldRefreshPublishedAt,
} from "@/lib/publication";

const GAME_CACHE_TTL = 60; // 1 minute

import { GAME_TYPES } from "@/lib/constants";
export { GAME_TYPES };

/** 去空、裁剪、去重（不区分大小写），最多 20 个 */
function normalizeAliases(aliases?: string[] | null): string[] {
  if (!aliases) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const a of aliases) {
    const trimmed = a.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= 20) break;
  }
  return result;
}

export const gameRouter = router({
  /** 游戏列表（分页、标签筛选、搜索、排序） */
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
        tagId: z.string().optional(),
        tagSlugs: z.array(z.string()).max(10).optional(),
        excludeTagSlugs: z.array(z.string()).max(10).optional(),
        search: z.string().optional(),
        gameType: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "downloads", "titleAsc", "titleDesc"]).default("latest"),
        timeRange: z.enum(["all", "today", "week", "month"]).default("all"),
        /** 按投稿时填写的「原作者」(extraInfo.originalAuthor) 筛选 */
        originalAuthor: z.string().min(1).max(120).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, tagSlugs, excludeTagSlugs, search, gameType, sortBy, timeRange, originalAuthor } =
        input;

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

      if (tagSlugs?.length) {
        baseWhere.AND = [
          ...(Array.isArray(baseWhere.AND) ? baseWhere.AND : []),
          ...tagSlugs.map((slug) => ({
            tags: { some: { tag: { slug } } },
          })),
        ];
      }

      if (excludeTagSlugs?.length) {
        baseWhere.NOT = excludeTagSlugs.map((slug) => ({
          tags: { some: { tag: { slug } } },
        }));
      }

      if (gameType) {
        baseWhere.gameType = gameType;
      }

      if (timeFilter) {
        addWhereAnd(baseWhere, gamePublicationDateWhere({ gte: timeFilter }));
      }

      if (originalAuthor) {
        // 按 extraInfo->>'originalAuthor' 精确筛选
        baseWhere.extraInfo = { path: ["originalAuthor"], equals: originalAuthor };
      }

      const listInclude = {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { likes: true, dislikes: true, comments: true, favorites: true } },
      } as const;

      if (shouldMeiliListSearch(search)) {
        const q = search!.trim();
        const filter = gameListMeiliFilter({ tagId, tagSlugs, excludeTagSlugs, gameType, timeFilter });
        const offset = (page - 1) * limit;
        const msRes = await meili.index(INDEX.game).search(q, {
          limit,
          offset,
          filter,
          sort: gameListMeiliSort(sortBy),
          attributesToRetrieve: ["id"],
        });
        const ids = msRes.hits.map((h: Record<string, unknown>) => String(h.id));
        const rows = await ctx.prisma.game.findMany({
          where: { id: { in: ids }, status: "PUBLISHED" },
          include: listInclude,
        });
        const byId = new Map(rows.map((g) => [g.id, g] as const));
        const games = ids.map((id: string) => byId.get(id)).filter((g): g is (typeof rows)[number] => Boolean(g));
        const totalCount = msRes.estimatedTotalHits ?? msRes.hits.length;
        return {
          games,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        };
      }

      const orderBy = {
        latest: gamePublicationOrderBy,
        views: { views: "desc" as const },
        downloads: { downloads: "desc" as const },
        likes: { likes: { _count: "desc" as const } },
        titleAsc: { title: "asc" as const },
        titleDesc: { title: "desc" as const },
      }[sortBy];

      const skip = (page - 1) * limit;

      const [games, totalCount] = await Promise.all([
        ctx.prisma.game.findMany({
          take: limit,
          skip,
          where: baseWhere,
          orderBy,
          include: listInclude,
        }),
        ctx.prisma.game.count({ where: baseWhere }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return { games, totalCount, totalPages, currentPage: page };
    }),

  /**
   * 按投稿时填写的「原作者」(extraInfo.originalAuthor) 聚合游戏列表。
   * 用于 /game 页「作者」tab：每个 item 是一位原作者及其游戏统计 + 4 张代表作封面。
   * 点击后跳转到 /game?originalAuthor=xxx，复用 list 的 originalAuthor 筛选。
   */
  listAuthors: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(12),
        page: z.number().min(1).default(1),
        sortBy: z.enum(["latest", "gameCount", "views"]).default("gameCount"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, sortBy } = input;
      const offset = (page - 1) * limit;

      const orderColumn = sortBy === "gameCount" ? "game_count" : sortBy === "views" ? "total_views" : "latest_at";

      const rows = await ctx.prisma.$queryRaw<
        Array<{ author: string; game_count: bigint; total_views: bigint; latest_at: Date }>
      >(Prisma.sql`
        SELECT
          "extraInfo"->>'originalAuthor' AS author,
          COUNT(*)::bigint AS game_count,
          COALESCE(SUM(views), 0)::bigint AS total_views,
          MAX(COALESCE("publishedAt", "createdAt")) AS latest_at
        FROM "Game"
        WHERE status = 'PUBLISHED'
          AND "extraInfo" ? 'originalAuthor'
          AND "extraInfo"->>'originalAuthor' IS NOT NULL
          AND "extraInfo"->>'originalAuthor' <> ''
        GROUP BY "extraInfo"->>'originalAuthor'
        ORDER BY ${Prisma.raw(`"${orderColumn}"`)} DESC
        LIMIT ${limit} OFFSET ${offset}
      `);

      const totalRows = await ctx.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT "extraInfo"->>'originalAuthor')::bigint AS count
        FROM "Game"
        WHERE status = 'PUBLISHED'
          AND "extraInfo" ? 'originalAuthor'
          AND "extraInfo"->>'originalAuthor' IS NOT NULL
          AND "extraInfo"->>'originalAuthor' <> ''
      `);
      const totalCount = Number(totalRows[0]?.count ?? 0);

      const items = await Promise.all(
        rows.map(async (r) => {
          const previewGames = await ctx.prisma.game.findMany({
            where: {
              status: "PUBLISHED",
              extraInfo: { path: ["originalAuthor"], equals: r.author },
            },
            select: { id: true, coverUrl: true, title: true },
            orderBy: gamePublicationOrderBy,
            take: 4,
          });
          return {
            author: r.author,
            gameCount: Number(r.game_count),
            totalViews: Number(r.total_views),
            latestAt: r.latest_at,
            previewGames,
          };
        }),
      );

      return {
        items,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  /** 获取单个游戏详情 */
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const game = await ctx.prisma.game.findUnique({
      where: { id: input.id },
      include: {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        versions: {
          orderBy: { sortOrder: "asc" },
        },
        aliases: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
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
      return memGetOrSet(
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
        GAME_CACHE_TTL * 5 * 1000,
      );
    }),

  /** 获取游戏类型统计 */
  getTypeStats: publicProcedure.query(async ({ ctx }) => {
    return memGetOrSet(
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
      GAME_CACHE_TTL * 5 * 1000,
    );
  }),

  /** 获取相关游戏推荐 */
  getRelated: publicProcedure
    .input(
      z.object({
        gameId: z.string(),
        limit: z.number().min(1).max(20).default(6),
      }),
    )
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
        isNsfw: z.boolean().default(false),
        version: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
        aliases: z.array(z.string().min(1).max(100)).max(20).optional(),
        extraInfo: z.any().optional(),
        versions: z
          .array(
            z.object({
              label: z.string().min(1).max(100),
              description: z.string().max(10000).optional(),
            }),
          )
          .optional(),
        customTabs: z
          .array(
            z.object({
              title: z.string().min(1).max(100),
              icon: z.string().max(50).optional(),
              content: z.string().max(50000),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, tagNames, aliases, versions, customTabs, ...data } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      const gameId = await generateContentId(ctx.prisma, "game");
      const allTagIds = await resolveAllTagIds(ctx.prisma, tagIds, tagNames);
      const status = resolvePublishStatus(user.role);

      const game = await ctx.prisma.game.create({
        data: {
          id: gameId,
          title: data.title,
          description: data.description || null,
          coverUrl: data.coverUrl || null,
          gameType: data.gameType || null,
          isFree: data.isFree,
          isNsfw: data.isNsfw,
          version: data.version || null,
          extraInfo: data.extraInfo || undefined,
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          uploaderId: ctx.session.user.id,
          tags: {
            create: allTagIds.map((tagId) => ({ tagId })),
          },
          versions:
            versions && versions.length > 0
              ? {
                  create: versions.map((v, i) => ({
                    label: v.label,
                    description: v.description || null,
                    sortOrder: i,
                  })),
                }
              : undefined,
          customTabs:
            customTabs && customTabs.length > 0
              ? {
                  create: customTabs.map((t, i) => ({
                    title: t.title,
                    icon: t.icon || null,
                    content: t.content,
                    sortOrder: i,
                  })),
                }
              : undefined,
          aliases: normalizeAliases(aliases).length
            ? {
                create: normalizeAliases(aliases).map((name) => ({ name })),
              }
            : undefined,
        },
      });

      scheduleTagCountRefresh(allTagIds, "游戏创建");
      void safeSync(syncGame(game.id));

      if (status === "PUBLISHED") {
        submitGameToIndexNow(game.id).catch(() => {});
      }

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
              isNsfw: z.boolean().default(false),
              version: z.string().optional(),
              tagNames: z.array(z.string()).optional(),
              extraInfo: z.any().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);
      await assertBatchLimit(ctx.prisma, input.games.length);
      const status = resolvePublishStatus(user.role);

      const allTagNames = new Set<string>();
      for (const g of input.games) {
        for (const t of g.tagNames ?? []) allTagNames.add(t);
      }
      const tagNameToId = await resolveTagNames(ctx.prisma, [...allTagNames]);

      const results: { title: string; id?: string; error?: string; updated?: boolean }[] = [];
      const previousTagIds = new Set<string>();

      for (const gameInput of input.games) {
        try {
          const tagIds = (gameInput.tagNames ?? []).map((n) => tagNameToId.get(n)).filter((id): id is string => !!id);

          const existing = await ctx.prisma.game.findFirst({
            where: { title: gameInput.title, uploaderId: ctx.session.user.id },
            select: { id: true, tags: { select: { tagId: true } } },
          });

          if (existing) {
            for (const t of existing.tags) previousTagIds.add(t.tagId);

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
                isNsfw: gameInput.isNsfw,
                version: gameInput.version || null,
                extraInfo: gameInput.extraInfo || undefined,
                tags: {
                  create: tagIds.map((tagId) => ({ tagId })),
                },
              },
            });

            results.push({ title: gameInput.title, id: existing.id, updated: true });
          } else {
            const gameId = await generateContentId(ctx.prisma, "game");

            await ctx.prisma.game.create({
              data: {
                id: gameId,
                title: gameInput.title,
                description: gameInput.description || null,
                coverUrl: gameInput.coverUrl || null,
                gameType: gameInput.gameType || null,
                isFree: gameInput.isFree,
                isNsfw: gameInput.isNsfw,
                version: gameInput.version || null,
                extraInfo: gameInput.extraInfo || undefined,
                status,
                publishedAt: status === "PUBLISHED" ? new Date() : null,
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

      scheduleTagCountRefresh([...new Set([...previousTagIds, ...tagNameToId.values()])], "游戏批量导入");

      for (const r of results) {
        if (r.id && !r.error) {
          void safeSync(syncGame(r.id));
        }
      }

      const successIds = results.filter((r) => r.id && !r.error).map((r) => r.id!);
      if (successIds.length > 0 && status === "PUBLISHED") {
        submitGamesToIndexNow(successIds).catch(() => {});
      }

      return { results };
    }),

  /** 批量提交游戏到 IndexNow */
  submitBatchToIndexNow: protectedProcedure
    .input(z.object({ gameIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const result = await submitGamesToIndexNow(input.gameIds);
      return result;
    }),

  /** 获取当前用户的游戏列表（含所有状态） */
  getMyGames: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).default("latest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search, sortBy } = input;

      const where: Prisma.GameWhereInput = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: Prisma.QueryMode.insensitive } }),
      };

      const orderBy = {
        latest: { createdAt: "desc" as const },
        views: { views: "desc" as const },
        likes: { likes: { _count: "desc" as const } },
        titleAsc: { title: "asc" as const },
        titleDesc: { title: "desc" as const },
      }[sortBy];

      const [games, totalCount] = await Promise.all([
        ctx.prisma.game.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy,
          include: {
            tags: {
              include: { tag: { select: { id: true, name: true, slug: true } } },
            },
            _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
          },
        }),
        ctx.prisma.game.count({ where }),
      ]);

      return {
        games,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  /** 获取当前用户所有游戏 ID（用于全选） */
  getMyGameIds: protectedProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;

      const where: Prisma.GameWhereInput = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: Prisma.QueryMode.insensitive } }),
      };

      const games = await ctx.prisma.game.findMany({
        where,
        select: { id: true },
      });

      return games.map((g) => g.id);
    }),

  /** 获取游戏编辑数据（上传者可编辑自己的游戏） */
  getEditData: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const game = await ctx.prisma.game.findUnique({
      where: { id: input.id },
      include: {
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        versions: {
          orderBy: { sortOrder: "asc" },
        },
        customTabs: {
          orderBy: { sortOrder: "asc" },
        },
        aliases: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!game) {
      throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
    }

    if (game.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己的游戏" });
    }

    return game;
  }),

  /** 更新游戏（上传者可编辑自己的游戏，编辑后普通用户重新进入审核） */
  update: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        gameType: z.string().optional(),
        isFree: z.boolean().optional(),
        isNsfw: z.boolean().optional(),
        version: z.string().optional(),
        extraInfo: z.any().optional(),
        tagNames: z.array(z.string()).optional(),
        aliases: z.array(z.string().min(1).max(100)).max(20).optional(),
        versions: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string().min(1).max(100),
              description: z.string().max(10000).optional(),
            }),
          )
          .optional(),
        customTabs: z
          .array(
            z.object({
              id: z.string().optional(),
              title: z.string().min(1).max(100),
              icon: z.string().max(50).optional(),
              content: z.string().max(50000),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { gameId, tagNames, aliases, versions, customTabs, ...updateFields } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      const game = await ctx.prisma.game.findUnique({
        where: { id: gameId },
        select: { uploaderId: true, status: true, tags: { select: { tagId: true } } },
      });
      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
      }
      assertOwnership(game.uploaderId, ctx.session.user.id, user.role, "只能编辑自己的游戏");

      const status = resolvePublishStatus(user.role);
      const previousTagIds = game.tags.map((t) => t.tagId);

      await ctx.prisma.game.update({
        where: { id: gameId },
        data: {
          ...updateFields,
          coverUrl: updateFields.coverUrl === undefined ? undefined : updateFields.coverUrl || null,
          status,
          ...(shouldRefreshPublishedAt(game.status, status) ? { publishedAt: new Date() } : {}),
        },
      });

      if (tagNames) {
        await ctx.prisma.tagOnGame.deleteMany({ where: { gameId } });
        const allTagIds = await resolveAllTagIds(ctx.prisma, undefined, tagNames);
        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnGame.createMany({
            data: allTagIds.map((tagId) => ({ gameId, tagId })),
            skipDuplicates: true,
          });
        }
        scheduleTagCountRefresh([...new Set([...previousTagIds, ...allTagIds])], "游戏编辑");
      }

      if (versions !== undefined) {
        await ctx.prisma.gameVersion.deleteMany({ where: { gameId } });
        if (versions.length > 0) {
          await ctx.prisma.gameVersion.createMany({
            data: versions.map((v, i) => ({
              gameId,
              label: v.label,
              description: v.description || null,
              sortOrder: i,
            })),
          });
        }
      }

      if (customTabs !== undefined) {
        await ctx.prisma.gameCustomTab.deleteMany({ where: { gameId } });
        if (customTabs.length > 0) {
          await ctx.prisma.gameCustomTab.createMany({
            data: customTabs.map((t, i) => ({
              gameId,
              title: t.title,
              icon: t.icon || null,
              content: t.content,
              sortOrder: i,
            })),
          });
        }
      }

      if (aliases !== undefined) {
        await ctx.prisma.gameAlias.deleteMany({ where: { gameId } });
        const normalized = normalizeAliases(aliases);
        if (normalized.length > 0) {
          await ctx.prisma.gameAlias.createMany({
            data: normalized.map((name) => ({ gameId, name })),
            skipDuplicates: true,
          });
        }
      }

      void safeSync(syncGame(gameId));

      return { success: true };
    }),

  /** 删除游戏（仅限上传者） */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const game = await ctx.prisma.game.findUnique({
      where: { id: input.id },
      select: { uploaderId: true, tags: { select: { tagId: true } } },
    });

    if (!game) {
      throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
    }

    if (game.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此游戏" });
    }

    const tagIds = game.tags.map((t) => t.tagId);

    await ctx.prisma.game.delete({ where: { id: input.id } });

    void safeSync(deleteGame(input.id));

    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 游戏删除后刷新失败", err);
      });
    }

    return { success: true };
  }),

  /** 批量删除游戏（仅限上传者） */
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.string()) })).mutation(async ({ ctx, input }) => {
    const games = await ctx.prisma.game.findMany({
      where: {
        id: { in: input.ids },
        uploaderId: ctx.session.user.id,
      },
      select: { id: true, tags: { select: { tagId: true } } },
    });

    if (games.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "没有找到可删除的游戏" });
    }

    const gameIds = games.map((g) => g.id);
    const tagIds = [...new Set(games.flatMap((g) => g.tags.map((t) => t.tagId)))];

    await ctx.prisma.game.deleteMany({
      where: { id: { in: gameIds } },
    });

    for (const gid of gameIds) {
      void safeSync(deleteGame(gid));
    }

    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 游戏批量删除后刷新失败", err);
      });
    }

    return { success: true, count: gameIds.length };
  }),

  /**
   * 批量查询当前登录用户已收藏的游戏 ID。
   * 用于列表卡片显示心形按钮的填充态。未登录返回空数组。
   */
  favoritedMap: publicProcedure
    .input(z.object({ gameIds: z.array(z.string()).max(60) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId || input.gameIds.length === 0) return { favoritedIds: [] as string[] };
      const records = await ctx.prisma.gameFavorite.findMany({
        where: { userId, gameId: { in: input.gameIds } },
        select: { gameId: true },
      });
      return { favoritedIds: records.map((r) => r.gameId) };
    }),

  /** 切换收藏 */
  toggleFavorite: protectedProcedure.input(z.object({ gameId: z.string() })).mutation(async ({ ctx, input }) => {
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
      const pointsAwarded = await awardPoints(userId, "FAVORITE_GAME", undefined, input.gameId, {
        firstTimeOnly: true,
      });
      return { favorited: true, pointsAwarded };
    }
  }),

  /** 切换点赞/点踩 */
  toggleReaction: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        type: z.enum(["like", "dislike"]),
      }),
    )
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
        const pointsAwarded = await awardPoints(userId, "LIKE_GAME", undefined, gameId, { firstTimeOnly: true });
        return { liked: true, disliked: false, pointsAwarded };
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

  /** 获取指定用户的游戏收藏列表（公开） */
  getUserFavorites: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: input.userId,
        game: { status: "PUBLISHED" as const },
      };

      const [favorites, totalCount] = await Promise.all([
        ctx.prisma.gameFavorite.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            game: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.gameFavorite.count({ where }),
      ]);

      return {
        games: favorites.filter((f) => f.game !== null).map((f) => f.game),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  /** 获取指定用户喜欢（点赞）的游戏列表（公开） */
  getUserLiked: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: input.userId,
        game: { status: "PUBLISHED" as const },
      };

      const [likes, totalCount] = await Promise.all([
        ctx.prisma.gameLike.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            game: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.gameLike.count({ where }),
      ]);

      return {
        games: likes.filter((l) => l.game !== null).map((l) => l.game),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  /** 记录下载 */
  trackDownload: publicProcedure
    .input(z.object({ gameId: z.string(), visitorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.visitorId) {
        const dedupKey = `download:game:${input.gameId}:${input.visitorId}`;
        const isNew = await redisSetNX(dedupKey, "1", 3600);
        if (!isNew) return { success: true, deduplicated: true };
      }
      await ctx.prisma.game.update({
        where: { id: input.gameId },
        data: { downloads: { increment: 1 } },
      });
      return { success: true };
    }),

  /** 增加浏览量 */
  incrementViews: publicProcedure
    .input(z.object({ id: z.string(), visitorId: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const dedup = await checkViewDedup({
        type: "game",
        contentId: input.id,
        visitorId: input.visitorId,
        ipv4: ctx.ipv4Address,
        ipv6: ctx.ipv6Address,
      });
      if (!dedup.allow) return { success: true, deduplicated: true, reason: dedup.reason };
      await ctx.prisma.game.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });
      return { success: true };
    }),

  /** 记录浏览历史 */
  recordView: protectedProcedure.input(z.object({ gameId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.gameViewHistory.findUnique({
      where: {
        userId_gameId: {
          userId: ctx.session.user.id,
          gameId: input.gameId,
        },
      },
      select: { id: true },
    });

    await ctx.prisma.gameViewHistory.upsert({
      where: {
        userId_gameId: {
          userId: ctx.session.user.id,
          gameId: input.gameId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        userId: ctx.session.user.id,
        gameId: input.gameId,
      },
    });

    let pointsAwarded = 0;
    if (!existing) {
      pointsAwarded = await awardPoints(ctx.session.user.id, "VIEW_GAME", undefined, input.gameId);
    }
    return { success: true, pointsAwarded };
  }),

  /** 获取指定用户的游戏浏览记录（公开） */
  getUserHistory: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: input.userId,
        game: { status: "PUBLISHED" as const },
      };

      const [history, totalCount] = await Promise.all([
        ctx.prisma.gameViewHistory.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            game: {
              include: {
                uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
                tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.gameViewHistory.count({ where }),
      ]);

      return {
        games: history.filter((h) => h.game !== null).map((h) => h.game),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  /** 检查用户交互状态 */
  getUserInteraction: protectedProcedure.input(z.object({ gameId: z.string() })).query(async ({ ctx, input }) => {
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
