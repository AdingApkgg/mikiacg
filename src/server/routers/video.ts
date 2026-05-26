import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { memGet, memSet, memGetOrSet, memDelete } from "@/lib/memory-cache";
import { checkViewDedup } from "@/lib/view-dedup";
import { submitVideoToIndexNow, submitVideosToIndexNow } from "@/lib/indexnow";
import { enqueueCoverForVideo } from "@/lib/cover-auto";
import { awardPoints } from "@/lib/points";
import { createNotification } from "@/lib/notification";
import { isPrivileged } from "@/lib/permissions";
import {
  generateContentId,
  generateContentIds,
  resolveAllTagIds,
  resolveTagNames,
  resolvePublishStatus,
  assertCanUpload,
  assertBatchLimit,
  scheduleTagCountRefresh,
} from "@/server/publish-utils";
import { meili, INDEX, safeSync } from "@/lib/meilisearch";
import { syncVideo, deleteVideo } from "@/lib/search-sync";
import { shouldMeiliListSearch, videoListMeiliFilter, videoListMeiliSort } from "@/lib/meili-filters";
import { suggestionTextRank } from "@/lib/search-text";
import { getPublicSiteConfig } from "@/lib/site-config";
import {
  addWhereAnd,
  gamePublicationDateWhere,
  shouldRefreshPublishedAt,
  videoPublicationDateWhere,
  videoPublicationOrderBy,
} from "@/lib/publication";

const VIDEO_CACHE_TTL = 60; // 1 minute
const STATS_CACHE_TTL = 15; // 15 seconds - 短缓存，仅防止并发请求
const SEARCH_SUGGESTIONS_CACHE_TTL = 300; // 5 minutes

export const videoRouter = router({
  // 记录搜索
  recordSearch: publicProcedure
    .input(
      z.object({
        keyword: z.string().min(1).max(100),
        resultCount: z.number().default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 标准化关键词
      const keyword = input.keyword.trim().toLowerCase();
      if (keyword.length < 2) return { success: true };

      await ctx.prisma.searchRecord.create({
        data: {
          keyword,
          userId: ctx.session?.user?.id,
          resultCount: input.resultCount,
        },
      });

      // 热搜缓存已有 30 分钟 TTL，单次搜索不需要立即失效
      // 仅清除精确的 search:hot 键即可（避免 SCAN 扫描）
      memDelete("search:hot");

      return { success: true };
    }),

  // 热搜榜
  getHotSearches: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return memGetOrSet(
        "search:hot",
        async () => {
          // 获取最近 7 天的搜索记录
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          // 1. 搜索记录 + 2. 热门视频标签 + 3. 热门游戏标签（并行查询）
          const [searchRecords, hotVideos, hotGames] = await Promise.all([
            ctx.prisma.searchRecord.groupBy({
              by: ["keyword"],
              where: {
                createdAt: { gte: sevenDaysAgo },
              },
              _count: { keyword: true },
              orderBy: { _count: { keyword: "desc" } },
              take: 50,
            }),
            ctx.prisma.video.findMany({
              where: {
                status: "PUBLISHED",
                ...videoPublicationDateWhere({ gte: sevenDaysAgo }),
              },
              select: {
                views: true,
                tags: {
                  include: { tag: { select: { name: true } } },
                  take: 3,
                },
              },
              orderBy: { views: "desc" },
              take: 30,
            }),
            ctx.prisma.game.findMany({
              where: {
                status: "PUBLISHED",
                ...gamePublicationDateWhere({ gte: sevenDaysAgo }),
              },
              select: {
                views: true,
                tags: {
                  include: { tag: { select: { name: true } } },
                  take: 3,
                },
              },
              orderBy: { views: "desc" },
              take: 20,
            }),
          ]);

          // 3. 合并计算热度分数
          const scoreMap = new Map<string, { score: number; searchCount: number }>();

          // 搜索记录权重（主要来源）
          searchRecords.forEach((record) => {
            const keyword = record.keyword;
            const searchScore = record._count.keyword * 10; // 每次搜索 10 分
            const existing = scoreMap.get(keyword) || { score: 0, searchCount: 0 };
            scoreMap.set(keyword, {
              score: existing.score + searchScore,
              searchCount: record._count.keyword,
            });
          });

          // 热门视频标签权重
          hotVideos.forEach((video) => {
            video.tags.forEach((t) => {
              const tagName = t.tag.name.toLowerCase();
              const tagScore = Math.log10(video.views + 1) * 5; // 播放量对数权重
              const existing = scoreMap.get(tagName) || { score: 0, searchCount: 0 };
              scoreMap.set(tagName, {
                score: existing.score + tagScore,
                searchCount: existing.searchCount,
              });
            });
          });

          // 热门游戏标签权重（权重略低于视频）
          hotGames.forEach((game) => {
            game.tags.forEach((t) => {
              const tagName = t.tag.name.toLowerCase();
              const tagScore = Math.log10(game.views + 1) * 3;
              const existing = scoreMap.get(tagName) || { score: 0, searchCount: 0 };
              scoreMap.set(tagName, {
                score: existing.score + tagScore,
                searchCount: existing.searchCount,
              });
            });
          });

          // 4. 过滤和排序
          const hotSearches = Array.from(scoreMap.entries())
            .filter(([keyword]) => keyword.length >= 2 && keyword.length <= 20)
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, input.limit)
            .map(([keyword, data], index) => ({
              keyword,
              score: Math.round(data.score),
              isHot: index < 3 && data.searchCount > 5, // 前 3 且搜索次数 > 5 标记为热门
            }));

          // 5. 如果没有搜索记录，回退到标签热度
          if (hotSearches.length < input.limit) {
            const topTags = await ctx.prisma.tag.findMany({
              select: { name: true },
              orderBy: { videos: { _count: "desc" } },
              take: input.limit - hotSearches.length,
            });

            const existingKeywords = new Set(hotSearches.map((h) => h.keyword.toLowerCase()));
            topTags.forEach((tag) => {
              if (!existingKeywords.has(tag.name.toLowerCase())) {
                hotSearches.push({
                  keyword: tag.name,
                  score: 0,
                  isHot: false,
                });
              }
            });
          }

          return hotSearches;
        },
        1800 * 1000,
      );
    }),

  // 搜索建议
  searchSuggestions: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(50),
        limit: z.number().min(1).max(10).default(5),
      }),
    )
    .query(async ({ input }) => {
      const { query, limit } = input;
      const cacheKey = `search:suggestions:${query.toLowerCase()}`;

      return memGetOrSet(
        cacheKey,
        async () => {
          const fetchCap = Math.min(30, Math.max(limit * 3, 12));
          const mq = query.trim();
          const pub = `status = "PUBLISHED"`;

          const [vRes, tRes, gRes, iRes, uRes] = await Promise.all([
            meili.index(INDEX.video).search(mq, {
              limit: fetchCap,
              filter: pub,
              attributesToRetrieve: ["id", "title", "views"],
            }),
            meili.index(INDEX.tag).search(mq, {
              limit: fetchCap,
              attributesToRetrieve: ["id", "name", "slug", "videoCount"],
            }),
            meili.index(INDEX.game).search(mq, {
              limit: fetchCap,
              filter: pub,
              attributesToRetrieve: ["id", "title", "views"],
            }),
            meili.index(INDEX.image).search(mq, {
              limit: fetchCap,
              filter: pub,
              attributesToRetrieve: ["id", "title", "views"],
            }),
            meili.index(INDEX.user).search(mq, {
              limit: fetchCap,
              filter: "isBanned = false",
              attributesToRetrieve: ["id", "username", "nickname"],
            }),
          ]);

          const videos = vRes.hits.map((h: Record<string, unknown>) => {
            const x = h as { id: string; title: string; views: number };
            return { id: x.id, title: x.title, views: x.views };
          });
          const games = gRes.hits.map((h: Record<string, unknown>) => {
            const x = h as { id: string; title: string; views: number };
            return { id: x.id, title: x.title, views: x.views };
          });
          const imagePosts = iRes.hits.map((h: Record<string, unknown>) => {
            const x = h as { id: string; title: string; views: number };
            return { id: x.id, title: x.title, views: x.views };
          });
          const tags = tRes.hits.map((h: Record<string, unknown>) => {
            const x = h as { id: string; name: string; slug: string; videoCount: number };
            return { id: x.id, name: x.name, slug: x.slug, videoCount: x.videoCount };
          });
          const users = uRes.hits.map((h: Record<string, unknown>) => {
            const x = h as { id: string; username: string; nickname?: string };
            return { id: x.id, username: x.username, nickname: x.nickname ?? null };
          });

          const scoreTitle = (title: string, views: number) =>
            suggestionTextRank(title, query) * 50_000 + Math.min(views, 999_999);

          const sortedVideos = [...videos]
            .sort((a, b) => scoreTitle(b.title, b.views) - scoreTitle(a.title, a.views))
            .slice(0, limit)
            .map((v) => ({ id: v.id, title: v.title }));

          const sortedGames = [...games]
            .sort((a, b) => scoreTitle(b.title, b.views) - scoreTitle(a.title, a.views))
            .slice(0, limit)
            .map((g) => ({ id: g.id, title: g.title }));

          const sortedImages = [...imagePosts]
            .sort((a, b) => scoreTitle(b.title, b.views) - scoreTitle(a.title, a.views))
            .slice(0, limit)
            .map((p) => ({ id: p.id, title: p.title }));

          const displayName = (u: { username: string; nickname: string | null }) => u.nickname?.trim() || u.username;

          const userRank = (u: { username: string; nickname: string | null }) =>
            Math.max(suggestionTextRank(u.nickname ?? "", query), suggestionTextRank(u.username, query));

          const sortedUsers = [...users].sort((a, b) => userRank(b) - userRank(a)).slice(0, 5);

          const sortedTags = [...tags]
            .sort(
              (a, b) =>
                suggestionTextRank(b.name, query) * 20_000 +
                b.videoCount * 2 -
                (suggestionTextRank(a.name, query) * 20_000 + a.videoCount * 2),
            )
            .slice(0, 5)
            .map((t) => ({ id: t.id, name: t.name, slug: t.slug }));

          return {
            videos: sortedVideos,
            tags: sortedTags,
            games: sortedGames,
            imagePosts: sortedImages,
            users: sortedUsers.map((u) => ({
              id: u.id,
              username: u.username,
              nickname: u.nickname,
              displayName: displayName(u),
            })),
          };
        },
        SEARCH_SUGGESTIONS_CACHE_TTL * 1000,
      );
    }),

  // 获取网站公开统计数据
  getPublicStats: publicProcedure.query(async ({ ctx }) => {
    return memGetOrSet(
      "stats:public",
      async () => {
        const [videoCount, userCount, tagCount, viewsResult] = await Promise.all([
          ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
          ctx.prisma.user.count(),
          ctx.prisma.tag.count(),
          ctx.prisma.video.aggregate({
            where: { status: "PUBLISHED" },
            _sum: { views: true },
          }),
        ]);

        return {
          videoCount,
          userCount,
          tagCount,
          totalViews: viewsResult._sum.views || 0,
        };
      },
      STATS_CACHE_TTL * 1000,
    );
  }),

  // 获取视频列表（支持页码分页）
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
        tagId: z.string().optional(),
        tagSlugs: z.array(z.string()).max(10).optional(),
        excludeTagSlugs: z.array(z.string()).max(10).optional(),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).default("latest"),
        timeRange: z.enum(["all", "today", "week", "month"]).default("all"),
        /** 按投稿时填写的原作者 (extraInfo.author) 筛选 */
        author: z.string().min(1).max(120).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, tagSlugs, excludeTagSlugs, search, sortBy, timeRange, author } = input;

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

      const listInclude = {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
      } as const;

      if (shouldMeiliListSearch(search)) {
        const q = search!.trim();
        const filter = videoListMeiliFilter({ tagId, tagSlugs, excludeTagSlugs, timeFilter });
        const offset = (page - 1) * limit;
        const msRes = await meili.index(INDEX.video).search(q, {
          limit,
          offset,
          filter,
          sort: videoListMeiliSort(sortBy),
          attributesToRetrieve: ["id"],
        });
        const ids = msRes.hits.map((h: Record<string, unknown>) => String(h.id));
        const rows = await ctx.prisma.video.findMany({
          where: { id: { in: ids }, status: "PUBLISHED" },
          include: listInclude,
        });
        const byId = new Map(rows.map((v) => [v.id, v] as const));
        const videos = ids.map((id: string) => byId.get(id)).filter((v): v is (typeof rows)[number] => Boolean(v));
        const totalCount = msRes.estimatedTotalHits ?? msRes.hits.length;
        return {
          videos,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        };
      }

      const baseWhere: Prisma.VideoWhereInput = {
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

      if (timeFilter) {
        addWhereAnd(baseWhere, videoPublicationDateWhere({ gte: timeFilter }));
      }

      if (author) {
        // 按 extraInfo->>'author' 精确筛选
        baseWhere.extraInfo = { path: ["author"], equals: author };
      }

      const orderBy = {
        latest: videoPublicationOrderBy,
        views: { views: "desc" as const },
        likes: { likes: { _count: "desc" as const } },
        titleAsc: { title: "asc" as const },
        titleDesc: { title: "desc" as const },
      }[sortBy];

      const skip = (page - 1) * limit;

      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
          take: limit,
          skip,
          where: baseWhere,
          orderBy,
          include: listInclude,
        }),
        ctx.prisma.video.count({ where: baseWhere }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return { videos, totalCount, totalPages, currentPage: page };
    }),

  /**
   * 批量查询当前登录用户对一组视频的观看进度。
   * 用于列表卡片展示「进度条 + 已看完」状态。未登录返回空 map。
   */
  progressMap: publicProcedure
    .input(z.object({ videoIds: z.array(z.string()).max(60) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId || input.videoIds.length === 0) {
        return { progressByVideoId: {} as Record<string, { progress: number; duration: number | null }> };
      }
      const records = await ctx.prisma.watchHistory.findMany({
        where: { userId, videoId: { in: input.videoIds } },
        select: {
          videoId: true,
          progress: true,
          video: { select: { duration: true } },
        },
      });
      const map: Record<string, { progress: number; duration: number | null }> = {};
      for (const r of records) {
        map[r.videoId] = { progress: r.progress, duration: r.video.duration ?? null };
      }
      return { progressByVideoId: map };
    }),

  /**
   * 批量查询当前登录用户已收藏的视频 ID 列表。
   * 用于列表卡片显示心形按钮的填充态。未登录返回空数组。
   */
  favoritedMap: publicProcedure
    .input(z.object({ videoIds: z.array(z.string()).max(60) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId || input.videoIds.length === 0) {
        return { favoritedIds: [] as string[] };
      }
      const records = await ctx.prisma.favorite.findMany({
        where: { userId, videoId: { in: input.videoIds } },
        select: { videoId: true },
      });
      return { favoritedIds: records.map((r) => r.videoId) };
    }),

  /**
   * 按投稿时填写的「原作者」(extraInfo.author) 聚合视频列表。
   * 用于视频列表页「作者」tab：每个 item 是一位原作者及其视频统计 + 4 张预览封面。
   * 点击后跳转到 /video?author=xxx，复用 list 的 author 筛选。
   */
  listAuthors: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(12),
        page: z.number().min(1).default(1),
        sortBy: z.enum(["latest", "videoCount", "views"]).default("latest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, sortBy } = input;
      const offset = (page - 1) * limit;

      // 排序列：latest=最新发布、videoCount=视频数、views=总播放
      const orderColumn = sortBy === "videoCount" ? "video_count" : sortBy === "views" ? "total_views" : "latest_at";

      // 聚合查询：按 extraInfo->>'author' 分组
      const rows = await ctx.prisma.$queryRaw<
        Array<{ author: string; video_count: bigint; total_views: bigint; latest_at: Date }>
      >(
        Prisma.sql`
          SELECT
            "extraInfo"->>'author' AS author,
            COUNT(*)::bigint AS video_count,
            COALESCE(SUM(views), 0)::bigint AS total_views,
            MAX(COALESCE("publishedAt", "createdAt")) AS latest_at
          FROM "Video"
          WHERE status = 'PUBLISHED'
            AND "extraInfo" ? 'author'
            AND "extraInfo"->>'author' IS NOT NULL
            AND "extraInfo"->>'author' <> ''
          GROUP BY "extraInfo"->>'author'
          ORDER BY ${Prisma.raw(`"${orderColumn}"`)} DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      );

      const totalRows = await ctx.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(DISTINCT "extraInfo"->>'author')::bigint AS count
          FROM "Video"
          WHERE status = 'PUBLISHED'
            AND "extraInfo" ? 'author'
            AND "extraInfo"->>'author' IS NOT NULL
            AND "extraInfo"->>'author' <> ''
        `,
      );
      const totalCount = Number(totalRows[0]?.count ?? 0);

      // 为每位原作者拉 4 张最近预览（顺序保留，方便组件按返回顺序渲染）
      const items = await Promise.all(
        rows.map(async (r) => {
          const previewVideos = await ctx.prisma.video.findMany({
            where: {
              status: "PUBLISHED",
              extraInfo: { path: ["author"], equals: r.author },
            },
            select: { id: true, coverUrl: true, title: true },
            orderBy: videoPublicationOrderBy,
            take: 4,
          });
          return {
            author: r.author,
            videoCount: Number(r.video_count),
            totalViews: Number(r.total_views),
            latestAt: r.latest_at,
            previewVideos,
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

  // 获取单个视频
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const cacheKey = `video:${input.id}`;
    const cached = memGet<typeof video>(cacheKey);
    if (cached) return cached;

    const video = await ctx.prisma.video.findUnique({
      where: { id: input.id, status: "PUBLISHED" },
      include: {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { likes: true, dislikes: true, confused: true, favorites: true } },
      },
    });

    if (!video) {
      throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
    }

    memSet(cacheKey, video, VIDEO_CACHE_TTL * 1000);
    return video;
  }),

  // 获取用户自己的视频列表（分页版）
  getMyVideos: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).default("latest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search, sortBy } = input;

      const where = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: "insensitive" as const } }),
      };

      const orderBy =
        sortBy === "views"
          ? { views: "desc" as const }
          : sortBy === "likes"
            ? { createdAt: "desc" as const }
            : sortBy === "titleAsc"
              ? { title: "asc" as const }
              : sortBy === "titleDesc"
                ? { title: "desc" as const }
                : { createdAt: "desc" as const };

      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
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
        ctx.prisma.video.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        videos,
        totalCount,
        totalPages,
        currentPage: page,
      };
    }),

  // 获取用户所有视频的 ID（用于全选）
  getMyVideoIds: protectedProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;

      const where = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: "insensitive" as const } }),
      };

      const videos = await ctx.prisma.video.findMany({
        where,
        select: { id: true },
      });

      return videos.map((v) => v.id);
    }),

  // 获取单个视频用于编辑（无需 PUBLISHED 状态限制）
  getForEdit: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const video = await ctx.prisma.video.findUnique({
      where: { id: input.id },
      include: {
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    if (!video) {
      throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
    }

    if (video.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此视频" });
    }

    return video;
  }),

  // 增加播放量
  incrementViews: publicProcedure
    .input(z.object({ id: z.string(), visitorId: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const dedup = await checkViewDedup({
        type: "video",
        contentId: input.id,
        visitorId: input.visitorId,
        ipv4: ctx.ipv4Address,
        ipv6: ctx.ipv6Address,
      });
      if (!dedup.allow) return { success: true, deduplicated: true, reason: dedup.reason };
      await ctx.prisma.video.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });
      memDelete(`video:${input.id}`);
      return { success: true };
    }),

  // 批量提交 IndexNow（用于批量导入完成后）
  submitBatchToIndexNow: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const result = await submitVideosToIndexNow(input.videoIds);
      return result;
    }),

  // 创建视频
  create: protectedProcedure
    .input(
      z.object({
        customId: z.string().min(1).max(20).optional(), // 自定义 ID（可选，默认自动生成 6 位数字）
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url(),
        duration: z.number().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
        pages: z
          .array(
            z.object({
              page: z.number(),
              title: z.string(),
              cid: z.number().optional(),
            }),
          )
          .optional(), // B站分P信息
        isNsfw: z.boolean().default(false),
        skipIndexNow: z.boolean().optional(), // 批量导入时跳过 IndexNow
        // 扩展信息
        extraInfo: z
          .object({
            intro: z.string().optional(),
            episodes: z
              .array(
                z.object({
                  title: z.string(),
                  content: z.string(),
                }),
              )
              .optional(),
            author: z.string().optional(),
            authorIntro: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            downloads: z
              .array(
                z.object({
                  name: z.string(),
                  url: z.string(),
                  password: z.string().optional(),
                }),
              )
              .optional(),
            relatedVideos: z.array(z.string()).optional(),
            notices: z
              .array(
                z.object({
                  type: z.enum(["info", "success", "warning", "error"]),
                  content: z.string(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { customId, tagIds, tagNames, coverUrl, pages, skipIndexNow, extraInfo, isNsfw, ...data } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      if (customId) {
        const existing = await ctx.prisma.video.findUnique({
          where: { id: customId.toLowerCase() },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `视频 ${customId.toLowerCase()} 已存在`,
          });
        }
      }

      const uniqueTagIds = await resolveAllTagIds(ctx.prisma, tagIds, tagNames);
      const videoId = customId ? customId.toLowerCase() : await generateContentId(ctx.prisma, "video");
      const status = resolvePublishStatus(user.role);

      const video = await ctx.prisma.video.create({
        data: {
          id: videoId,
          title: data.title,
          description: data.description,
          videoUrl: data.videoUrl,
          duration: data.duration,
          isNsfw,
          status,
          ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
          ...(coverUrl ? { coverUrl } : {}),
          ...(pages && pages.length > 1 ? { pages } : {}),
          ...(extraInfo ? { extraInfo } : {}),
          uploader: { connect: { id: ctx.session.user.id } },
          ...(uniqueTagIds.length > 0
            ? { tags: { create: uniqueTagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
            : {}),
        },
      });

      scheduleTagCountRefresh(uniqueTagIds, "视频创建");
      void safeSync(syncVideo(video.id));

      if (!skipIndexNow && status === "PUBLISHED") {
        submitVideoToIndexNow(video.id).catch(() => {});
      }

      enqueueCoverForVideo(video.id, video.coverUrl).catch(() => {});

      return video;
    }),

  // 批量创建视频（含合集，一次事务完成）
  batchCreate: protectedProcedure
    .input(
      z.object({
        seriesTitle: z.string().max(100).optional(),
        seriesDescription: z.string().max(5000).optional(),
        seriesCoverUrl: z.string().optional(),
        videos: z
          .array(
            z.object({
              title: z.string().min(1).max(100),
              description: z.string().max(5000).optional(),
              coverUrl: z.string().optional(),
              videoUrl: z.string().url(),
              isNsfw: z.boolean().default(false),
              tagNames: z.array(z.string()).optional(),
              extraInfo: z
                .object({
                  intro: z.string().optional(),
                  episodes: z
                    .array(
                      z.object({
                        title: z.string(),
                        content: z.string().optional().default(""),
                      }),
                    )
                    .optional(),
                  author: z.string().optional(),
                  authorIntro: z.string().optional(),
                  keywords: z.array(z.string()).optional(),
                  downloads: z
                    .array(
                      z.object({
                        name: z.string().optional().default(""),
                        url: z.string(),
                        password: z.string().optional(),
                      }),
                    )
                    .optional(),
                  relatedVideos: z.array(z.string()).optional(),
                  notices: z
                    .array(
                      z.object({
                        type: z.enum(["info", "success", "warning", "error"]),
                        content: z.string(),
                      }),
                    )
                    .optional(),
                })
                .optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);
      await assertBatchLimit(ctx.prisma, input.videos.length);
      const status = resolvePublishStatus(user.role);

      // 1) 按 videoUrl 查重：仅复用当前用户上传的视频，防止挂载他人视频
      const videoUrls = input.videos.map((v) => v.videoUrl);
      const existingVideos = await ctx.prisma.video.findMany({
        where: { videoUrl: { in: videoUrls }, uploaderId: ctx.session.user.id },
        select: { id: true, videoUrl: true },
      });
      const existingByUrl = new Map<string, string>(existingVideos.map((r) => [r.videoUrl, r.id]));

      // 2) 批量预处理标签
      const allTagNames = new Set<string>();
      for (const v of input.videos) {
        for (const t of v.tagNames ?? []) allTagNames.add(t);
      }
      const tagNameToId = await resolveTagNames(ctx.prisma, [...allTagNames]);

      // 3) 为需要新建的视频批量生成 ID
      const videoIds: string[] = [];
      const needNewIdIndexes: number[] = [];
      for (let i = 0; i < input.videos.length; i++) {
        const existingId = existingByUrl.get(input.videos[i].videoUrl);
        if (existingId) {
          videoIds[i] = existingId;
        } else {
          needNewIdIndexes.push(i);
        }
      }

      const newIds = await generateContentIds(ctx.prisma, "video", needNewIdIndexes.length);
      for (let j = 0; j < needNewIdIndexes.length; j++) {
        videoIds[needNewIdIndexes[j]] = newIds[j];
      }

      // 4) 事务：创建合集 + 仅新建视频 + 剧集关联
      const results: { title: string; id?: string; error?: string; merged?: boolean }[] = [];
      const txOps: Prisma.PrismaPromise<unknown>[] = [];

      let seriesId: string | undefined;
      if (input.seriesTitle) {
        const sid = `s_${Date.now().toString(36)}`;
        seriesId = sid;
        const firstDl = input.videos[0]?.extraInfo?.downloads?.[0];
        txOps.push(
          ctx.prisma.series.create({
            data: {
              id: sid,
              title: input.seriesTitle,
              description: input.seriesDescription || undefined,
              coverUrl: input.seriesCoverUrl || undefined,
              downloadUrl: firstDl?.url || undefined,
              downloadNote: firstDl?.name || undefined,
              creatorId: ctx.session.user.id,
            },
          }),
        );
      }

      for (let i = 0; i < input.videos.length; i++) {
        const v = input.videos[i];
        const videoId = videoIds[i];
        const isMerged = existingByUrl.has(v.videoUrl);

        if (!isMerged) {
          const tagIds = [...new Set((v.tagNames ?? []).map((n) => tagNameToId.get(n)).filter(Boolean))] as string[];
          txOps.push(
            ctx.prisma.video.create({
              data: {
                id: videoId,
                title: v.title,
                description: v.description,
                videoUrl: v.videoUrl,
                isNsfw: v.isNsfw,
                status,
                ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}),
                ...(v.coverUrl ? { coverUrl: v.coverUrl } : {}),
                ...(v.extraInfo ? { extraInfo: v.extraInfo } : {}),
                uploader: { connect: { id: ctx.session.user.id } },
                ...(tagIds.length > 0
                  ? { tags: { create: tagIds.map((tid) => ({ tag: { connect: { id: tid } } })) } }
                  : {}),
              },
            }),
          );
        }

        if (seriesId) {
          txOps.push(
            ctx.prisma.seriesEpisode.upsert({
              where: {
                seriesId_videoId: { seriesId, videoId },
              },
              create: {
                seriesId,
                videoId,
                episodeNum: i + 1,
              },
              update: { episodeNum: i + 1 },
            }),
          );
        }

        results.push({
          title: v.title,
          id: videoId,
          merged: isMerged,
        });
      }

      try {
        await ctx.prisma.$transaction(txOps);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "事务失败";
        return {
          success: false,
          seriesId: undefined as string | undefined,
          total: input.videos.length,
          successCount: 0,
          failCount: input.videos.length,
          results: results.map((r) => ({ ...r, id: undefined, error: msg })),
        };
      }

      for (let i = 0; i < input.videos.length; i++) {
        if (!results[i].merged) {
          enqueueCoverForVideo(videoIds[i], input.videos[i].coverUrl || null).catch(() => {});
        }
      }

      // 批量导入后刷新标签计数
      const previousTagIds = new Set<string>();
      for (const [, vid] of existingByUrl) {
        const oldTags = await ctx.prisma.tagOnVideo.findMany({
          where: { videoId: vid },
          select: { tagId: true },
        });
        for (const t of oldTags) previousTagIds.add(t.tagId);
      }
      scheduleTagCountRefresh([...new Set([...previousTagIds, ...tagNameToId.values()])], "视频批量导入");

      for (const r of results) {
        if (r.id && !r.merged) {
          void safeSync(syncVideo(r.id));
        }
      }

      // 仅 PUBLISHED 状态时推送 IndexNow
      if (status === "PUBLISHED") {
        const newVideoIds = results.filter((r) => r.id && !r.merged).map((r) => r.id!);
        if (newVideoIds.length > 0) {
          submitVideosToIndexNow(newVideoIds).catch(() => {});
        }
      }

      return {
        success: true,
        seriesId,
        total: input.videos.length,
        successCount: results.length,
        failCount: 0,
        results,
      };
    }),

  // 更新视频
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url().optional(),
        isNsfw: z.boolean().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
        // 扩展信息
        extraInfo: z
          .object({
            intro: z.string().optional(),
            episodes: z
              .array(
                z.object({
                  title: z.string(),
                  content: z.string(),
                }),
              )
              .optional(),
            author: z.string().optional(),
            authorIntro: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            downloads: z
              .array(
                z.object({
                  name: z.string(),
                  url: z.string(),
                  password: z.string().optional(),
                }),
              )
              .optional(),
            relatedVideos: z.array(z.string()).optional(),
            notices: z
              .array(
                z.object({
                  type: z.enum(["info", "success", "warning", "error"]),
                  content: z.string(),
                }),
              )
              .optional(),
          })
          .optional()
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, tagNames, extraInfo, ...data } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      const video = await ctx.prisma.video.findUnique({
        where: { id },
        select: { uploaderId: true, status: true },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (video.uploaderId !== ctx.session.user.id && !isPrivileged(user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己的视频" });
      }

      const status = resolvePublishStatus(user.role);

      const updateData: Prisma.VideoUpdateInput = {
        ...data,
        status,
        ...(shouldRefreshPublishedAt(video.status, status) ? { publishedAt: new Date() } : {}),
        ...(extraInfo !== undefined
          ? {
              extraInfo: extraInfo ? JSON.parse(JSON.stringify(extraInfo)) : Prisma.JsonNull,
            }
          : {}),
      };
      const updated = await ctx.prisma.video.update({
        where: { id },
        data: updateData,
      });

      if (tagIds !== undefined || tagNames !== undefined) {
        const oldTags = await ctx.prisma.tagOnVideo.findMany({
          where: { videoId: id },
          select: { tagId: true },
        });
        const oldTagIds = oldTags.map((t) => t.tagId);

        const allTagIds = await resolveAllTagIds(ctx.prisma, tagIds, tagNames);

        await ctx.prisma.tagOnVideo.deleteMany({
          where: { videoId: id },
        });

        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnVideo.createMany({
            data: allTagIds.map((tagId) => ({
              videoId: id,
              tagId,
            })),
          });
        }

        scheduleTagCountRefresh([...new Set([...oldTagIds, ...allTagIds])], "视频编辑");
      }

      memDelete(`video:${id}`);

      submitVideoToIndexNow(id).catch(() => {});

      enqueueCoverForVideo(updated.id, updated.coverUrl).catch(() => {});

      void safeSync(syncVideo(id));

      return updated;
    }),

  // 删除视频（真删除）
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const video = await ctx.prisma.video.findUnique({
      where: { id: input.id },
      select: { uploaderId: true, tags: { select: { tagId: true } } },
    });

    if (!video) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (video.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const tagIds = video.tags.map((t) => t.tagId);

    // 获取视频所在的合集ID（删除前）
    const episodes = await ctx.prisma.seriesEpisode.findMany({
      where: { videoId: input.id },
      select: { seriesId: true },
    });
    const seriesIds = episodes.map((e) => e.seriesId);

    // 真删除视频（关联记录会通过 CASCADE 自动删除）
    await ctx.prisma.video.delete({ where: { id: input.id } });

    // 清理空合集（没有关联任何视频的合集）
    if (seriesIds.length > 0) {
      await ctx.prisma.series.deleteMany({
        where: {
          id: { in: seriesIds },
          episodes: { none: {} },
        },
      });
    }

    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 视频删除后刷新失败", err);
      });
    }

    memDelete(`video:${input.id}`);
    void safeSync(deleteVideo(input.id));
    return { success: true };
  }),

  // 批量删除视频
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.string()) })).mutation(async ({ ctx, input }) => {
    // 验证所有视频属于当前用户
    const videos = await ctx.prisma.video.findMany({
      where: {
        id: { in: input.ids },
        uploaderId: ctx.session.user.id,
      },
      select: { id: true, tags: { select: { tagId: true } } },
    });

    if (videos.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "没有找到可删除的视频" });
    }

    const videoIds = videos.map((v) => v.id);
    const tagIds = [...new Set(videos.flatMap((v) => v.tags.map((t) => t.tagId)))];

    // 获取视频所在的合集ID（删除前）
    const episodes = await ctx.prisma.seriesEpisode.findMany({
      where: { videoId: { in: videoIds } },
      select: { seriesId: true },
    });
    const seriesIds = [...new Set(episodes.map((e) => e.seriesId))];

    // 批量删除
    await ctx.prisma.video.deleteMany({
      where: { id: { in: videoIds } },
    });

    for (const vid of videoIds) {
      void safeSync(deleteVideo(vid));
    }

    // 刷新受影响标签的反规范化计数
    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 批量删除后刷新失败", err);
      });
    }

    // 清理空合集
    if (seriesIds.length > 0) {
      await ctx.prisma.series.deleteMany({
        where: {
          id: { in: seriesIds },
          episodes: { none: {} },
        },
      });
    }

    for (const id of videoIds) memDelete(`video:${id}`);

    return { success: true, count: videoIds.length };
  }),

  // 点赞
  like: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.like.findUnique({
      where: {
        userId_videoId: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      },
    });

    if (existing) {
      await ctx.prisma.like.delete({
        where: { id: existing.id },
      });
      memDelete(`video:${input.videoId}`);
      return { liked: false };
    }

    // 点赞时移除踩和疑惑
    await Promise.all([
      ctx.prisma.dislike.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
      ctx.prisma.confused.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
    ]);

    await ctx.prisma.like.create({
      data: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });

    memDelete(`video:${input.videoId}`);
    const pointsAwarded = await awardPoints(ctx.session.user.id, "LIKE_VIDEO", undefined, input.videoId, {
      firstTimeOnly: true,
    });

    const video = await ctx.prisma.video.findUnique({
      where: { id: input.videoId },
      select: { uploaderId: true, title: true },
    });
    if (video && video.uploaderId !== ctx.session.user.id) {
      const liker = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { nickname: true, username: true },
      });
      createNotification({
        userId: video.uploaderId,
        type: "LIKE",
        title: "收到点赞",
        content: `${liker?.nickname || liker?.username || "某用户"} 赞了你的视频「${video.title}」`,
        data: { videoId: input.videoId },
      }).catch(() => {});
    }

    return { liked: true, pointsAwarded };
  }),

  // 踩
  dislike: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.dislike.findUnique({
      where: {
        userId_videoId: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      },
    });

    if (existing) {
      await ctx.prisma.dislike.delete({
        where: { id: existing.id },
      });
      memDelete(`video:${input.videoId}`);
      return { disliked: false };
    }

    // 踩时移除赞和疑惑
    await Promise.all([
      ctx.prisma.like.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
      ctx.prisma.confused.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
    ]);

    await ctx.prisma.dislike.create({
      data: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });

    memDelete(`video:${input.videoId}`);
    return { disliked: true };
  }),

  // 疑惑
  confused: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.confused.findUnique({
      where: {
        userId_videoId: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      },
    });

    if (existing) {
      await ctx.prisma.confused.delete({
        where: { id: existing.id },
      });
      memDelete(`video:${input.videoId}`);
      return { confused: false };
    }

    // 疑惑时移除赞和踩
    await Promise.all([
      ctx.prisma.like.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
      ctx.prisma.dislike.deleteMany({
        where: { userId: ctx.session.user.id, videoId: input.videoId },
      }),
    ]);

    await ctx.prisma.confused.create({
      data: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });

    memDelete(`video:${input.videoId}`);
    return { confused: true };
  }),

  // 收藏
  favorite: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.favorite.findUnique({
      where: {
        userId_videoId: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      },
    });

    if (existing) {
      await ctx.prisma.favorite.delete({
        where: { id: existing.id },
      });
      memDelete(`video:${input.videoId}`);
      return { favorited: false };
    }

    await ctx.prisma.favorite.create({
      data: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });

    memDelete(`video:${input.videoId}`);
    const pointsAwarded = await awardPoints(ctx.session.user.id, "FAVORITE_VIDEO", undefined, input.videoId, {
      firstTimeOnly: true,
    });

    const video = await ctx.prisma.video.findUnique({
      where: { id: input.videoId },
      select: { uploaderId: true, title: true },
    });
    if (video && video.uploaderId !== ctx.session.user.id) {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { nickname: true, username: true },
      });
      createNotification({
        userId: video.uploaderId,
        type: "FAVORITE",
        title: "新收藏",
        content: `${user?.nickname || user?.username || "某用户"} 收藏了你的视频「${video.title}」`,
        data: { videoId: input.videoId },
      }).catch(() => {});
    }

    return { favorited: true, pointsAwarded };
  }),

  // 检查点赞/踩/疑惑/收藏状态
  getInteractionStatus: protectedProcedure.input(z.object({ videoId: z.string() })).query(async ({ ctx, input }) => {
    const [like, dislike, confused, favorite] = await Promise.all([
      ctx.prisma.like.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      }),
      ctx.prisma.dislike.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      }),
      ctx.prisma.confused.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      }),
      ctx.prisma.favorite.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      }),
    ]);

    return {
      liked: !!like,
      disliked: !!dislike,
      confused: !!confused,
      favorited: !!favorite,
    };
  }),

  // 管理员：审核视频
  moderate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.$transaction(async (tx) => {
        if (input.status === "PUBLISHED") {
          await tx.video.updateMany({
            where: { id: input.id, status: { not: "PUBLISHED" } },
            data: { status: "PUBLISHED", publishedAt: new Date() },
          });
          const publishedVideo = await tx.video.findUnique({ where: { id: input.id } });
          if (!publishedVideo) throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
          return publishedVideo;
        }

        return tx.video.update({
          where: { id: input.id },
          data: { status: input.status },
        });
      });

      memDelete(`video:${input.id}`);

      // 审核通过时通知搜索引擎索引
      if (input.status === "PUBLISHED") {
        submitVideoToIndexNow(input.id).catch(() => {});
      }
      void safeSync(syncVideo(input.id));

      return video;
    }),

  // 获取用户收藏列表
  getFavorites: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: ctx.session.user.id,
        video: { status: "PUBLISHED" as const },
      };

      const [favorites, totalCount] = await Promise.all([
        ctx.prisma.favorite.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.favorite.count({ where }),
      ]);

      return {
        favorites: favorites.filter((f) => f.video !== null).map((f) => f.video),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 获取用户喜欢（点赞）的视频列表
  getLiked: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: ctx.session.user.id,
        video: { status: "PUBLISHED" as const },
      };

      const [likes, totalCount] = await Promise.all([
        ctx.prisma.like.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.like.count({ where }),
      ]);

      return {
        videos: likes.filter((l) => l.video !== null).map((l) => l.video),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 获取指定用户的收藏列表（公开）
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
        video: { status: "PUBLISHED" as const },
      };

      const [favorites, totalCount] = await Promise.all([
        ctx.prisma.favorite.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.favorite.count({ where }),
      ]);

      return {
        favorites: favorites.filter((f) => f.video !== null).map((f) => f.video),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 获取指定用户喜欢（点赞）的视频列表（公开）
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
        video: { status: "PUBLISHED" as const },
      };

      const [likes, totalCount] = await Promise.all([
        ctx.prisma.like.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.like.count({ where }),
      ]);

      return {
        videos: likes.filter((l) => l.video !== null).map((l) => l.video),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 获取指定用户的观看历史（公开）
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
        video: { status: "PUBLISHED" as const },
      };

      const [history, totalCount] = await Promise.all([
        ctx.prisma.watchHistory.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.watchHistory.count({ where }),
      ]);

      return {
        history: history
          .filter((h) => h.video !== null)
          .map((h) => ({
            ...h.video,
            watchedAt: h.updatedAt,
            progress: h.progress,
          })),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 获取观看历史（当前用户自己的，保留兼容）
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = {
        userId: ctx.session.user.id,
        video: { status: "PUBLISHED" as const },
      };

      const [history, totalCount] = await Promise.all([
        ctx.prisma.watchHistory.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            video: {
              include: {
                uploader: {
                  select: { id: true, username: true, nickname: true, avatar: true },
                },
                tags: {
                  include: { tag: { select: { id: true, name: true, slug: true } } },
                },
                _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
              },
            },
          },
        }),
        ctx.prisma.watchHistory.count({ where }),
      ]);

      return {
        history: history
          .filter((h) => h.video !== null)
          .map((h) => ({
            ...h.video,
            watchedAt: h.updatedAt,
            progress: h.progress,
          })),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 记录观看历史
  recordHistory: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        progress: z.number().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.watchHistory.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
        select: { id: true },
      });

      await ctx.prisma.watchHistory.upsert({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
        update: { progress: input.progress },
        create: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
          progress: input.progress,
        },
      });

      let pointsAwarded = 0;
      if (!existing) {
        pointsAwarded = await awardPoints(ctx.session.user.id, "WATCH_VIDEO", undefined, input.videoId);
      }
      return { success: true, pointsAwarded };
    }),

  // 清空观看历史
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.watchHistory.deleteMany({
      where: { userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  // 删除单条历史记录
  removeHistoryItem: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.watchHistory.deleteMany({
      where: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });
    return { success: true };
  }),

  // 取消收藏
  unfavorite: protectedProcedure.input(z.object({ videoId: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.favorite.deleteMany({
      where: {
        userId: ctx.session.user.id,
        videoId: input.videoId,
      },
    });
    return { success: true };
  }),

  // 批量取消收藏
  batchUnfavorite: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.favorite.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: { in: input.videoIds },
        },
      });
      return { success: true, count: input.videoIds.length };
    }),

  // 批量删除历史记录
  batchRemoveHistory: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchHistory.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: { in: input.videoIds },
        },
      });
      return { success: true, count: input.videoIds.length };
    }),

  getByAuthor: publicProcedure
    .input(
      z.object({
        author: z.string().min(1),
        excludeVideoId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cfg = await getPublicSiteConfig();
      const where = {
        status: "PUBLISHED" as const,
        extraInfo: { path: ["author" as string], equals: input.author },
        ...(input.excludeVideoId ? { id: { not: input.excludeVideoId } } : {}),
      };

      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
          where,
          orderBy: videoPublicationOrderBy,
          take: cfg.videoSelectorMaxCount,
          select: {
            id: true,
            title: true,
            coverUrl: true,
            duration: true,
            views: true,
            isNsfw: true,
            createdAt: true,
            publishedAt: true,
            _count: { select: { likes: true } },
          },
        }),
        ctx.prisma.video.count({ where }),
      ]);

      return { videos, totalCount };
    }),

  getByUploader: publicProcedure
    .input(
      z.object({
        uploaderId: z.string(),
        excludeVideoId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cfg = await getPublicSiteConfig();
      const where = {
        uploaderId: input.uploaderId,
        status: "PUBLISHED" as const,
        ...(input.excludeVideoId ? { id: { not: input.excludeVideoId } } : {}),
      };

      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
          where,
          orderBy: videoPublicationOrderBy,
          take: cfg.videoSelectorMaxCount,
          select: {
            id: true,
            title: true,
            coverUrl: true,
            duration: true,
            views: true,
            isNsfw: true,
            createdAt: true,
            publishedAt: true,
            _count: { select: { likes: true } },
          },
        }),
        ctx.prisma.video.count({ where }),
      ]);

      return { videos, totalCount };
    }),

  getRecommendations: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { videoId, limit } = input;

      const videoSelect = {
        id: true,
        title: true,
        coverUrl: true,
        coverBlurHash: true,
        duration: true,
        views: true,
        isNsfw: true,
        createdAt: true,
        publishedAt: true,
        extraInfo: true,
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        _count: { select: { likes: true, dislikes: true } },
      } as const;

      const currentTags = await ctx.prisma.tagOnVideo.findMany({
        where: { videoId },
        select: { tagId: true },
      });
      const tagIds = currentTags.map((t) => t.tagId);

      if (tagIds.length > 0) {
        const related = await ctx.prisma.video.findMany({
          where: {
            id: { not: videoId },
            status: "PUBLISHED",
            tags: { some: { tagId: { in: tagIds } } },
          },
          select: {
            ...videoSelect,
            tags: { select: { tagId: true } },
          },
          take: limit * 3,
        });

        related.sort((a, b) => {
          const tagSet = new Set(tagIds);
          const aMatch = a.tags.filter((t) => tagSet.has(t.tagId)).length;
          const bMatch = b.tags.filter((t) => tagSet.has(t.tagId)).length;
          if (bMatch !== aMatch) return bMatch - aMatch;
          return b.views - a.views;
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const result = related.slice(0, limit).map(({ tags: _tags, ...rest }) => rest);

        if (result.length >= limit) return result;

        const excludeIds = [videoId, ...result.map((v) => v.id)];
        const filler = await ctx.prisma.video.findMany({
          where: { id: { notIn: excludeIds }, status: "PUBLISHED" },
          orderBy: { views: "desc" },
          take: limit - result.length,
          select: videoSelect,
        });
        return [...result, ...filler];
      }

      return ctx.prisma.video.findMany({
        where: { id: { not: videoId }, status: "PUBLISHED" },
        orderBy: { views: "desc" },
        take: limit,
        select: videoSelect,
      });
    }),

  // 批量按 ID 获取视频（输出顺序与输入 IDs 一致）
  batchGetByIds: publicProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];
      const videos = await ctx.prisma.video.findMany({
        where: { id: { in: input.ids }, status: "PUBLISHED" },
        include: {
          uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
          tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
          _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
        },
      });
      const byId = new Map(videos.map((v) => [v.id, v] as const));
      return input.ids.map((id) => byId.get(id)).filter((v): v is (typeof videos)[number] => Boolean(v));
    }),

  // 批量收藏（已收藏的会被跳过）
  batchFavorite: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // 过滤已存在的收藏和不存在的视频
      const [existing, validVideos] = await Promise.all([
        ctx.prisma.favorite.findMany({
          where: { userId, videoId: { in: input.videoIds } },
          select: { videoId: true },
        }),
        ctx.prisma.video.findMany({
          where: { id: { in: input.videoIds } },
          select: { id: true },
        }),
      ]);
      const existingIds = new Set(existing.map((e) => e.videoId));
      const validIds = new Set(validVideos.map((v) => v.id));
      const toAdd = input.videoIds.filter((id) => validIds.has(id) && !existingIds.has(id));

      if (toAdd.length === 0) return { success: true, addedCount: 0 };

      await ctx.prisma.favorite.createMany({
        data: toAdd.map((videoId) => ({ userId, videoId })),
        skipDuplicates: true,
      });

      for (const id of toAdd) memDelete(`video:${id}`);

      return { success: true, addedCount: toAdd.length };
    }),

  // 批量获取交互状态（点赞/踩/疑惑/收藏）
  batchInteractionStatus: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [likes, dislikes, confused, favorites] = await Promise.all([
        ctx.prisma.like.findMany({
          where: { userId, videoId: { in: input.videoIds } },
          select: { videoId: true },
        }),
        ctx.prisma.dislike.findMany({
          where: { userId, videoId: { in: input.videoIds } },
          select: { videoId: true },
        }),
        ctx.prisma.confused.findMany({
          where: { userId, videoId: { in: input.videoIds } },
          select: { videoId: true },
        }),
        ctx.prisma.favorite.findMany({
          where: { userId, videoId: { in: input.videoIds } },
          select: { videoId: true },
        }),
      ]);
      const likeSet = new Set(likes.map((l) => l.videoId));
      const dislikeSet = new Set(dislikes.map((d) => d.videoId));
      const confusedSet = new Set(confused.map((c) => c.videoId));
      const favSet = new Set(favorites.map((f) => f.videoId));

      return Object.fromEntries(
        input.videoIds.map((id) => [
          id,
          {
            liked: likeSet.has(id),
            disliked: dislikeSet.has(id),
            confused: confusedSet.has(id),
            favorited: favSet.has(id),
          },
        ]),
      );
    }),

  // 趋势视频（按最近 N 天内的点赞/收藏增长加权）
  trending: publicProcedure
    .input(
      z.object({
        days: z.number().min(1).max(30).default(7),
        limit: z.number().min(1).max(50).default(20),
        excludeNsfw: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      return memGetOrSet(
        `video:trending:${input.days}:${input.limit}:${input.excludeNsfw}`,
        async () => {
          const since = new Date();
          since.setDate(since.getDate() - input.days);

          // 统计最近点赞数、收藏数、评论数较高的视频
          const [likesGroup, favGroup, commentGroup] = await Promise.all([
            ctx.prisma.like.groupBy({
              by: ["videoId"],
              where: { createdAt: { gte: since } },
              _count: { _all: true },
              orderBy: { _count: { videoId: "desc" } },
              take: input.limit * 3,
            }),
            ctx.prisma.favorite.groupBy({
              by: ["videoId"],
              where: { createdAt: { gte: since } },
              _count: { _all: true },
              orderBy: { _count: { videoId: "desc" } },
              take: input.limit * 3,
            }),
            ctx.prisma.comment.groupBy({
              by: ["videoId"],
              where: { createdAt: { gte: since }, isDeleted: false, isHidden: false },
              _count: { _all: true },
              orderBy: { _count: { videoId: "desc" } },
              take: input.limit * 3,
            }),
          ]);

          const scoreMap = new Map<string, number>();
          for (const r of likesGroup) scoreMap.set(r.videoId, (scoreMap.get(r.videoId) ?? 0) + r._count._all * 3);
          for (const r of favGroup) scoreMap.set(r.videoId, (scoreMap.get(r.videoId) ?? 0) + r._count._all * 5);
          for (const r of commentGroup) scoreMap.set(r.videoId, (scoreMap.get(r.videoId) ?? 0) + r._count._all * 2);

          if (scoreMap.size === 0) {
            // 回退到最近高播放量
            return ctx.prisma.video.findMany({
              where: {
                status: "PUBLISHED",
                ...videoPublicationDateWhere({ gte: since }),
                ...(input.excludeNsfw ? { isNsfw: false } : {}),
              },
              orderBy: { views: "desc" },
              take: input.limit,
              include: {
                uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
                tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            });
          }

          const topIds = [...scoreMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, input.limit)
            .map(([id]) => id);

          const videos = await ctx.prisma.video.findMany({
            where: {
              id: { in: topIds },
              status: "PUBLISHED",
              ...(input.excludeNsfw ? { isNsfw: false } : {}),
            },
            include: {
              uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
              tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
              _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
            },
          });
          const byId = new Map(videos.map((v) => [v.id, v] as const));
          return topIds.map((id) => byId.get(id)).filter((v): v is (typeof videos)[number] => Boolean(v));
        },
        300 * 1000,
      );
    }),

  // 用户视频总体统计（发布数、总播放量、总点赞、总评论、总收藏）
  getMyStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [agg, byStatus, likeCount, commentCount, favoriteCount] = await Promise.all([
      ctx.prisma.video.aggregate({
        where: { uploaderId: userId },
        _sum: { views: true },
        _count: { _all: true },
      }),
      ctx.prisma.video.groupBy({
        by: ["status"],
        where: { uploaderId: userId },
        _count: { _all: true },
      }),
      ctx.prisma.like.count({ where: { video: { uploaderId: userId } } }),
      ctx.prisma.comment.count({ where: { video: { uploaderId: userId }, isDeleted: false } }),
      ctx.prisma.favorite.count({ where: { video: { uploaderId: userId } } }),
    ]);

    const statusCounts = { PUBLISHED: 0, PENDING: 0, REJECTED: 0, DELETED: 0 } as Record<string, number>;
    for (const s of byStatus) statusCounts[s.status] = s._count._all;

    return {
      totalVideos: agg._count._all,
      totalViews: agg._sum.views ?? 0,
      totalLikes: likeCount,
      totalComments: commentCount,
      totalFavorites: favoriteCount,
      byStatus: statusCounts,
    };
  }),
});
