import { z } from "zod";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getCache, setCache, getOrSet, deleteCache, deleteCacheKeys } from "@/lib/redis";
import { submitVideoToIndexNow, submitVideosToIndexNow } from "@/lib/indexnow";
import { enqueueCoverForVideo } from "@/lib/cover-auto";

const VIDEO_CACHE_TTL = 60; // 1 minute

/**
 * 生成随机 6 位数字视频 ID (000000 - 999999)
 * 随机生成并检查是否已存在
 */
async function generateVideoId(prisma: PrismaClient): Promise<string> {
  const maxAttempts = 100;
  
  for (let i = 0; i < maxAttempts; i++) {
    // 生成随机 6 位数字
    const randomNum = Math.floor(Math.random() * 1000000);
    const id = randomNum.toString().padStart(6, "0");
    
    // 检查是否已存在
    const existing = await prisma.video.findUnique({
      where: { id },
      select: { id: true },
    });
    
    if (!existing) {
      return id;
    }
  }
  
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "无法生成唯一视频 ID，请稍后重试",
  });
}
const STATS_CACHE_TTL = 15; // 15 seconds - 短缓存，仅防止并发请求
const SEARCH_SUGGESTIONS_CACHE_TTL = 300; // 5 minutes

export const videoRouter = router({
  // 记录搜索
  recordSearch: publicProcedure
    .input(z.object({
      keyword: z.string().min(1).max(100),
      resultCount: z.number().default(0),
    }))
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
      await deleteCache("search:hot");

      return { success: true };
    }),

  // 热搜榜
  getHotSearches: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return getOrSet("search:hot", async () => {
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
              createdAt: { gte: sevenDaysAgo },
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
              createdAt: { gte: sevenDaysAgo },
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

          const existingKeywords = new Set(hotSearches.map(h => h.keyword.toLowerCase()));
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
      }, 1800); // 缓存 30 分钟
    }),

  // 搜索建议
  searchSuggestions: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(50),
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;
      const cacheKey = `search:suggestions:${query.toLowerCase()}`;

      return getOrSet(cacheKey, async () => {
        // 并行搜索视频标题、标签和游戏标题
        const [videos, tags, games] = await Promise.all([
          ctx.prisma.video.findMany({
            where: {
              status: "PUBLISHED",
              title: { contains: query, mode: "insensitive" },
            },
            select: { id: true, title: true },
            take: limit,
            orderBy: { views: "desc" },
          }),
          ctx.prisma.tag.findMany({
            where: {
              name: { contains: query, mode: "insensitive" },
            },
            select: { id: true, name: true, slug: true },
            take: 5,
            orderBy: { videos: { _count: "desc" } },
          }),
          ctx.prisma.game.findMany({
            where: {
              status: "PUBLISHED",
              title: { contains: query, mode: "insensitive" },
            },
            select: { id: true, title: true },
            take: limit,
            orderBy: { views: "desc" },
          }),
        ]);

        return { videos, tags, games };
      }, SEARCH_SUGGESTIONS_CACHE_TTL);
    }),

  // 获取网站公开统计数据
  getPublicStats: publicProcedure.query(async ({ ctx }) => {
    return getOrSet("stats:public", async () => {
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
    }, STATS_CACHE_TTL);
  }),

  // 获取视频列表（支持页码分页）
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1), // 页码分页
        tagId: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes"]).default("latest"),
        timeRange: z.enum(["all", "today", "week", "month"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, search, sortBy, timeRange } = input;

      // 计算时间范围
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

      const baseWhere: Prisma.VideoWhereInput = {
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

      if (timeFilter) {
        baseWhere.createdAt = { gte: timeFilter };
      }

      const orderBy = {
        latest: { createdAt: "desc" as const },
        views: { views: "desc" as const },
        likes: { createdAt: "desc" as const }, // 简化处理
      }[sortBy];

      // 计算偏移量
      const skip = (page - 1) * limit;

      // 并行获取视频和总数量
      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
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
            _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
          },
        }),
        ctx.prisma.video.count({ where: baseWhere }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return { videos, totalCount, totalPages, currentPage: page };
    }),

  // 获取单个视频
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `video:${input.id}`;
      const cached = await getCache<typeof video>(cacheKey);
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

      await setCache(cacheKey, video, VIDEO_CACHE_TTL);
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
        sortBy: z.enum(["latest", "views", "likes"]).default("latest"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search, sortBy } = input;

      const where = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
      };

      const orderBy = sortBy === "views" 
        ? { views: 'desc' as const }
        : sortBy === "likes"
          ? { createdAt: 'desc' as const } // 先按时间排序，前端再排序
          : { createdAt: 'desc' as const };

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
      })
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;

      const where = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: 'insensitive' as const } }),
      };

      const videos = await ctx.prisma.video.findMany({
        where,
        select: { id: true },
      });

      return videos.map(v => v.id);
    }),

  // 获取单个视频用于编辑（无需 PUBLISHED 状态限制）
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
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
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.video.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });
      await deleteCache(`video:${input.id}`);
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
        pages: z.array(z.object({
          page: z.number(),
          title: z.string(),
          cid: z.number().optional(),
        })).optional(), // B站分P信息
        skipIndexNow: z.boolean().optional(), // 批量导入时跳过 IndexNow
        // 扩展信息
        extraInfo: z.object({
          intro: z.string().optional(),
          episodes: z.array(z.object({
            title: z.string(),
            content: z.string(),
          })).optional(),
          author: z.string().optional(),
          authorIntro: z.string().optional(),
          keywords: z.array(z.string()).optional(),
          downloads: z.array(z.object({
            name: z.string(),
            url: z.string(),
            password: z.string().optional(),
          })).optional(),
          relatedVideos: z.array(z.string()).optional(),
          notices: z.array(z.object({
            type: z.enum(['info', 'success', 'warning', 'error']),
            content: z.string(),
          })).optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { customId, tagIds, tagNames, coverUrl, pages, skipIndexNow, extraInfo, ...data } = input;

      // 检查投稿权限：ADMIN/OWNER 或有 canUpload 权限的用户
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });
      
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      }
      
      const canUpload = user.role === "ADMIN" || user.role === "OWNER" || user.canUpload;
      if (!canUpload) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "您暂无投稿权限，请联系管理员开通" 
        });
      }

      // 如果提供了自定义ID，检查是否已存在
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

      // 处理新标签（使用 upsert 避免并发冲突）
      const allTagIds: string[] = [...(tagIds || [])];
      if (tagNames && tagNames.length > 0) {
        for (const tagName of tagNames) {
          const slug = tagName
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`;
          
          try {
            // 使用 upsert 避免并发创建冲突
            const tag = await ctx.prisma.tag.upsert({
              where: { name: tagName },
              update: {}, // 已存在则不更新
              create: { name: tagName, slug },
            });
            if (!allTagIds.includes(tag.id)) {
              allTagIds.push(tag.id);
            }
          } catch {
            // 如果 upsert 失败（slug 冲突），尝试查找已存在的标签
            const existingTag = await ctx.prisma.tag.findFirst({
              where: { OR: [{ name: tagName }, { slug }] },
            });
            if (existingTag && !allTagIds.includes(existingTag.id)) {
              allTagIds.push(existingTag.id);
            }
          }
        }
      }

      // 去重标签ID
      const uniqueTagIds = [...new Set(allTagIds)];

      // 生成 6 位数字 ID
      const videoId = customId ? customId.toLowerCase() : await generateVideoId(ctx.prisma);

      const video = await ctx.prisma.video.create({
        data: {
          id: videoId,
          title: data.title,
          description: data.description,
          videoUrl: data.videoUrl,
          duration: data.duration,
          status: "PUBLISHED", // 直接发布，无需审核
          ...(coverUrl ? { coverUrl } : {}),
          ...(pages && pages.length > 1 ? { pages } : {}), // 只有多P时才保存
          ...(extraInfo ? { extraInfo } : {}), // 扩展信息
          uploader: { connect: { id: ctx.session.user.id } },
          ...(uniqueTagIds.length > 0 
            ? { tags: { create: uniqueTagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
            : {}),
        },
      });

      // 异步提交到 IndexNow（不阻塞响应，批量导入时跳过）
      if (!skipIndexNow) {
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
        seriesCoverUrl: z.string().url().optional().or(z.literal("")),
        videos: z.array(z.object({
          title: z.string().min(1).max(100),
          description: z.string().max(5000).optional(),
          coverUrl: z.string().url().optional().or(z.literal("")),
          videoUrl: z.string().url(),
          tagNames: z.array(z.string()).optional(),
          extraInfo: z.object({
            intro: z.string().optional(),
            episodes: z.array(z.object({
              title: z.string(),
              content: z.string(),
            })).optional(),
            author: z.string().optional(),
            authorIntro: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            downloads: z.array(z.object({
              name: z.string(),
              url: z.string(),
              password: z.string().optional(),
            })).optional(),
            relatedVideos: z.array(z.string()).optional(),
            notices: z.array(z.object({
              type: z.enum(['info', 'success', 'warning', 'error']),
              content: z.string(),
            })).optional(),
          }).optional(),
        })).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 检查投稿权限
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      const canUpload = user.role === "ADMIN" || user.role === "OWNER" || user.canUpload;
      if (!canUpload) {
        throw new TRPCError({ code: "FORBIDDEN", message: "您暂无投稿权限" });
      }

      // 1) 按 videoUrl 查重：已存在的视频复用，不重复创建
      const videoUrls = input.videos.map((v) => v.videoUrl);
      const existingVideos = await ctx.prisma.video.findMany({
        where: { videoUrl: { in: videoUrls } },
        select: { id: true, videoUrl: true },
      });
      const existingByUrl = new Map<string, string>(
        existingVideos.map((r) => [r.videoUrl, r.id]),
      );

      // 2) 批量预处理标签 — 收集所有唯一标签名，一次性 upsert
      const allTagNames = new Set<string>();
      for (const v of input.videos) {
        for (const t of v.tagNames ?? []) allTagNames.add(t);
      }
      const tagNameToId = new Map<string, string>();
      if (allTagNames.size > 0) {
        await Promise.all(
          [...allTagNames].map(async (tagName) => {
            const slug = tagName
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

      // 3) 为需要新建的视频生成 ID（仅对 videoUrl 不存在的项）
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

      const needed = needNewIdIndexes.length;
      const candidates: string[] = [];
      const candidateSet = new Set<string>();
      while (candidates.length < needed * 2) {
        const num = Math.floor(Math.random() * 1000000);
        const id = num.toString().padStart(6, "0");
        if (!candidateSet.has(id)) {
          candidateSet.add(id);
          candidates.push(id);
        }
      }
      const existingIds = new Set(
        (await ctx.prisma.video.findMany({
          where: { id: { in: candidates } },
          select: { id: true },
        })).map((r) => r.id),
      );
      let cursor = 0;
      for (const i of needNewIdIndexes) {
        while (cursor < candidates.length && existingIds.has(candidates[cursor])) cursor++;
        if (cursor >= candidates.length) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "无法生成足够唯一 ID" });
        }
        videoIds[i] = candidates[cursor++];
      }

      // 4) 事务：创建合集 + 仅新建视频 + 剧集关联（已存在视频也加入合集，用 upsert 防重复）
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
          })
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
                status: "PUBLISHED",
                ...(v.coverUrl ? { coverUrl: v.coverUrl } : {}),
                ...(v.extraInfo ? { extraInfo: v.extraInfo } : {}),
                uploader: { connect: { id: ctx.session.user.id } },
                ...(tagIds.length > 0
                  ? { tags: { create: tagIds.map((tid) => ({ tag: { connect: { id: tid } } })) } }
                  : {}),
              },
            })
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
            })
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
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
        // 扩展信息
        extraInfo: z.object({
          intro: z.string().optional(),
          episodes: z.array(z.object({
            title: z.string(),
            content: z.string(),
          })).optional(),
          author: z.string().optional(),
          authorIntro: z.string().optional(),
          keywords: z.array(z.string()).optional(),
          downloads: z.array(z.object({
            name: z.string(),
            url: z.string(),
            password: z.string().optional(),
          })).optional(),
          relatedVideos: z.array(z.string()).optional(),
          notices: z.array(z.object({
            type: z.enum(['info', 'success', 'warning', 'error']),
            content: z.string(),
          })).optional(),
        }).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, tagNames, extraInfo, ...data } = input;

      // 检查编辑权限：ADMIN/OWNER 或有 canUpload 权限的用户
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });
      
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      }
      
      const canUpload = user.role === "ADMIN" || user.role === "OWNER" || user.canUpload;
      if (!canUpload) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "您暂无编辑权限，请联系管理员开通" 
        });
      }

      const video = await ctx.prisma.video.findUnique({
        where: { id },
        select: { uploaderId: true },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (video.uploaderId !== ctx.session.user.id && user.role === "USER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己的视频" });
      }

      // 更新视频基本信息
      const updateData: Prisma.VideoUpdateInput = {
        ...data,
        ...(extraInfo !== undefined ? { 
          extraInfo: extraInfo ? JSON.parse(JSON.stringify(extraInfo)) : Prisma.JsonNull 
        } : {}),
      };
      const updated = await ctx.prisma.video.update({
        where: { id },
        data: updateData,
      });

      // 更新标签关联
      if (tagIds !== undefined || tagNames !== undefined) {
        // 处理新标签
        const allTagIds: string[] = [...(tagIds || [])];
        if (tagNames && tagNames.length > 0) {
          for (const tagName of tagNames) {
            const slug = tagName
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");
            
            const existingTag = await ctx.prisma.tag.findFirst({
              where: { OR: [{ name: tagName }, { slug }] },
            });
            
            if (existingTag) {
              if (!allTagIds.includes(existingTag.id)) {
                allTagIds.push(existingTag.id);
              }
            } else {
              const newTag = await ctx.prisma.tag.create({
                data: { name: tagName, slug: slug || `tag-${Date.now()}` },
              });
              allTagIds.push(newTag.id);
            }
          }
        }

        // 删除所有现有标签关联
        await ctx.prisma.tagOnVideo.deleteMany({
          where: { videoId: id },
        });

        // 创建新的标签关联
        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnVideo.createMany({
            data: allTagIds.map((tagId) => ({
              videoId: id,
              tagId,
            })),
          });
        }

        // 清理空标签
        await ctx.prisma.tag.deleteMany({
          where: {
            videos: { none: {} },
          },
        });
      }

      await deleteCache(`video:${id}`);

      // 视频更新后通知搜索引擎重新索引
      submitVideoToIndexNow(id).catch(() => {});

      enqueueCoverForVideo(updated.id, updated.coverUrl).catch(() => {});

      return updated;
    }),

  // 删除视频（真删除）
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      // 清理空标签（没有关联任何视频的标签）
      if (tagIds.length > 0) {
        await ctx.prisma.tag.deleteMany({
          where: {
            id: { in: tagIds },
            videos: { none: {} },
          },
        });
      }

      // 清理空合集（没有关联任何视频的合集）
      if (seriesIds.length > 0) {
        await ctx.prisma.series.deleteMany({
          where: {
            id: { in: seriesIds },
            episodes: { none: {} },
          },
        });
      }

      await deleteCache(`video:${input.id}`);
      return { success: true };
    }),

  // 批量删除视频
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
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

      const videoIds = videos.map(v => v.id);
      const tagIds = [...new Set(videos.flatMap(v => v.tags.map(t => t.tagId)))];

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

      // 清理空标签
      if (tagIds.length > 0) {
        await ctx.prisma.tag.deleteMany({
          where: {
            id: { in: tagIds },
            videos: { none: {} },
          },
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

      // 清理缓存（批量 pipeline 删除，一次网络往返）
      await deleteCacheKeys(videoIds.map(id => `video:${id}`));

      return { success: true, count: videoIds.length };
    }),

  // 点赞
  like: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      return { liked: true };
    }),

  // 踩
  dislike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      return { disliked: true };
    }),

  // 疑惑
  confused: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

      return { confused: true };
    }),

  // 收藏
  favorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
        return { favorited: false };
      }

      await ctx.prisma.favorite.create({
        data: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });

      return { favorited: true };
    }),

  // 检查点赞/踩/疑惑/收藏状态
  getInteractionStatus: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ ctx, input }) => {
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      await deleteCache(`video:${input.id}`);

      // 审核通过时通知搜索引擎索引
      if (input.status === "PUBLISHED") {
        submitVideoToIndexNow(input.id).catch(() => {});
      }

      return video;
    }),

  // 获取用户收藏列表
  getFavorites: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const favorites = await ctx.prisma.favorite.findMany({
        where: {
          userId: ctx.session.user.id,
          video: { status: "PUBLISHED" },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (favorites.length > input.limit) {
        const nextItem = favorites.pop();
        nextCursor = nextItem!.id;
      }

      return {
        favorites: favorites
          .filter((f) => f.video !== null)
          .map((f) => f.video),
        nextCursor,
      };
    }),

  // 获取用户喜欢（点赞）的视频列表
  getLiked: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const likes = await ctx.prisma.like.findMany({
        where: {
          userId: ctx.session.user.id,
          video: { status: "PUBLISHED" },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (likes.length > input.limit) {
        const nextItem = likes.pop();
        nextCursor = nextItem!.id;
      }

      return {
        videos: likes
          .filter((l) => l.video !== null)
          .map((l) => l.video),
        nextCursor,
      };
    }),

  // 获取指定用户的收藏列表（公开）
  getUserFavorites: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const favorites = await ctx.prisma.favorite.findMany({
        where: {
          userId: input.userId,
          video: { status: "PUBLISHED" },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (favorites.length > input.limit) {
        const nextItem = favorites.pop();
        nextCursor = nextItem!.id;
      }

      return {
        favorites: favorites
          .filter((f) => f.video !== null)
          .map((f) => f.video),
        nextCursor,
      };
    }),

  // 获取指定用户喜欢（点赞）的视频列表（公开）
  getUserLiked: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const likes = await ctx.prisma.like.findMany({
        where: {
          userId: input.userId,
          video: { status: "PUBLISHED" },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (likes.length > input.limit) {
        const nextItem = likes.pop();
        nextCursor = nextItem!.id;
      }

      return {
        videos: likes
          .filter((l) => l.video !== null)
          .map((l) => l.video),
        nextCursor,
      };
    }),

  // 获取指定用户的观看历史（公开）
  getUserHistory: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const history = await ctx.prisma.watchHistory.findMany({
        where: {
          userId: input.userId,
          video: {
            status: "PUBLISHED",
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (history.length > input.limit) {
        const nextItem = history.pop();
        nextCursor = nextItem!.id;
      }

      return {
        history: history
          .filter((h) => h.video !== null)
          .map((h) => ({
            ...h.video,
            watchedAt: h.updatedAt,
            progress: h.progress,
          })),
        nextCursor,
      };
    }),

  // 获取观看历史（当前用户自己的，保留兼容）
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const history = await ctx.prisma.watchHistory.findMany({
        where: {
          userId: ctx.session.user.id,
          video: {
            status: "PUBLISHED",
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
      });

      let nextCursor: string | undefined = undefined;
      if (history.length > input.limit) {
        const nextItem = history.pop();
        nextCursor = nextItem!.id;
      }

      return {
        history: history
          .filter((h) => h.video !== null)
          .map((h) => ({
            ...h.video,
            watchedAt: h.updatedAt,
            progress: h.progress,
          })),
        nextCursor,
      };
    }),

  // 记录观看历史
  recordHistory: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        progress: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
      return { success: true };
    }),

  // 清空观看历史
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.watchHistory.deleteMany({
      where: { userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  // 删除单条历史记录
  removeHistoryItem: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchHistory.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });
      return { success: true };
    }),

  // 取消收藏
  unfavorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
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

  // 获取相关视频（简单列表，按最新排序）
  getRecommendations: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { videoId, limit } = input;

      // 简单返回最新视频，排除当前视频
      return ctx.prisma.video.findMany({
        where: {
          id: { not: videoId },
          status: "PUBLISHED",
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
        },
      });
    }),
});
