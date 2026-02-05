import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";

export const seriesRouter = router({
  // 获取所有公开合集（首页用，页码分页）
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(12),
      page: z.number().min(1).default(1),
      sortBy: z.enum(["latest", "videoCount", "views"]).default("latest"),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, page, sortBy } = input;

      // 构建排序条件
      const orderBy = sortBy === "videoCount"
        ? { episodes: { _count: "desc" as const } }
        : sortBy === "views"
        ? { updatedAt: "desc" as const } // 暂时用更新时间代替
        : { updatedAt: "desc" as const };

      const skip = (page - 1) * limit;

      const [series, totalCount] = await Promise.all([
        ctx.prisma.series.findMany({
          include: {
            creator: {
              select: {
                id: true,
                username: true,
                nickname: true,
                avatar: true,
              },
            },
            _count: { select: { episodes: true } },
            episodes: {
              take: 4,
              orderBy: { episodeNum: "asc" },
              include: {
                video: {
                  select: {
                    id: true,
                    coverUrl: true,
                    title: true,
                    views: true,
                  },
                },
              },
            },
          },
          orderBy,
          take: limit,
          skip,
        }),
        ctx.prisma.series.count(),
      ]);

      // 计算合集总播放量
      const seriesWithStats = await Promise.all(
        series.map(async (s) => {
          const totalViews = await ctx.prisma.video.aggregate({
            where: {
              seriesEpisodes: {
                some: { seriesId: s.id },
              },
            },
            _sum: { views: true },
          });

          return {
            id: s.id,
            title: s.title,
            description: s.description,
            coverUrl: s.coverUrl || s.episodes[0]?.video.coverUrl || null,
            creator: s.creator,
            episodeCount: s._count.episodes,
            totalViews: totalViews._sum.views || 0,
            previewVideos: s.episodes.map(ep => ({
              id: ep.video.id,
              coverUrl: ep.video.coverUrl,
              title: ep.video.title,
            })),
            updatedAt: s.updatedAt,
          };
        })
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        items: seriesWithStats,
        totalCount,
        totalPages,
        currentPage: page,
      };
    }),

  // 获取用户的所有合集
  listByUser: publicProcedure
    .input(z.object({
      userId: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = input.userId || ctx.session?.user?.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
      }

      const series = await ctx.prisma.series.findMany({
        where: { creatorId: userId },
        include: {
          _count: { select: { episodes: true } },
          episodes: {
            take: 1,
            orderBy: { episodeNum: "asc" },
            include: {
              video: {
                select: { id: true, coverUrl: true },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined;
      if (series.length > input.limit) {
        const nextItem = series.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: series.map(s => ({
          ...s,
          episodeCount: s._count.episodes,
          firstEpisodeCover: s.episodes[0]?.video.coverUrl || s.coverUrl,
        })),
        nextCursor,
      };
    }),

  // 获取单个合集详情（含所有剧集）
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.id },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          episodes: {
            orderBy: { episodeNum: "asc" },
            include: {
              video: {
                select: {
                  id: true,
                  title: true,
                  coverUrl: true,
                  duration: true,
                  views: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      return series;
    }),

  // 根据视频ID获取其所属的合集
  getByVideoId: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const episode = await ctx.prisma.seriesEpisode.findFirst({
        where: { videoId: input.videoId },
        include: {
          series: {
            include: {
              creator: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                },
              },
              episodes: {
                orderBy: { episodeNum: "asc" },
                include: {
                  video: {
                    select: {
                      id: true,
                      title: true,
                      coverUrl: true,
                      duration: true,
                      views: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!episode) {
        return null;
      }

      return {
        series: episode.series,
        currentEpisode: episode.episodeNum,
      };
    }),

  // 创建合集
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(100),
      description: z.string().max(2000).optional(),
      coverUrl: z.string().url().optional().or(z.literal("")),
      downloadUrl: z.string().url().optional().or(z.literal("")),
      downloadNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.create({
        data: {
          title: input.title,
          description: input.description || null,
          coverUrl: input.coverUrl || null,
          downloadUrl: input.downloadUrl || null,
          downloadNote: input.downloadNote || null,
          creatorId: ctx.session.user.id,
        },
      });

      return series;
    }),

  // 更新合集
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(100).optional(),
      description: z.string().max(2000).optional(),
      coverUrl: z.string().url().optional().or(z.literal("")),
      downloadUrl: z.string().url().optional().or(z.literal("")),
      downloadNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.id },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此合集" });
      }

      return ctx.prisma.series.update({
        where: { id: input.id },
        data: {
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl || null,
          downloadUrl: input.downloadUrl || null,
          downloadNote: input.downloadNote,
        },
      });
    }),

  // 删除合集
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.id },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此合集" });
      }

      await ctx.prisma.series.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // 添加视频到合集
  addVideo: protectedProcedure
    .input(z.object({
      seriesId: z.string(),
      videoId: z.string(),
      episodeNum: z.number().int().positive().optional(),
      episodeTitle: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.seriesId },
        include: { _count: { select: { episodes: true } } },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此合集" });
      }

      // 验证视频存在且属于用户
      const video = await ctx.prisma.video.findUnique({
        where: { id: input.videoId },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
      }

      if (video.uploaderId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能添加自己的视频" });
      }

      // 检查是否已在合集中
      const existing = await ctx.prisma.seriesEpisode.findUnique({
        where: {
          seriesId_videoId: {
            seriesId: input.seriesId,
            videoId: input.videoId,
          },
        },
      });

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "视频已在合集中" });
      }

      // 自动分配集数
      const episodeNum = input.episodeNum || (series._count.episodes + 1);

      // 检查集数是否已被占用
      const episodeExists = await ctx.prisma.seriesEpisode.findUnique({
        where: {
          seriesId_episodeNum: {
            seriesId: input.seriesId,
            episodeNum,
          },
        },
      });

      if (episodeExists) {
        throw new TRPCError({ code: "CONFLICT", message: `第 ${episodeNum} 集已存在` });
      }

      const episode = await ctx.prisma.seriesEpisode.create({
        data: {
          seriesId: input.seriesId,
          videoId: input.videoId,
          episodeNum,
          episodeTitle: input.episodeTitle || null,
        },
        include: {
          video: {
            select: {
              id: true,
              title: true,
              coverUrl: true,
            },
          },
        },
      });

      // 更新合集的 updatedAt
      await ctx.prisma.series.update({
        where: { id: input.seriesId },
        data: { updatedAt: new Date() },
      });

      return episode;
    }),

  // 从合集移除视频
  removeVideo: protectedProcedure
    .input(z.object({
      seriesId: z.string(),
      videoId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.seriesId },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此合集" });
      }

      await ctx.prisma.seriesEpisode.delete({
        where: {
          seriesId_videoId: {
            seriesId: input.seriesId,
            videoId: input.videoId,
          },
        },
      });

      // 检查合集是否还有视频，没有则自动删除合集
      const remainingCount = await ctx.prisma.seriesEpisode.count({
        where: { seriesId: input.seriesId },
      });

      if (remainingCount === 0) {
        await ctx.prisma.series.delete({
          where: { id: input.seriesId },
        });
        return { success: true, seriesDeleted: true };
      }

      return { success: true, seriesDeleted: false };
    }),

  // 更新剧集信息
  updateEpisode: protectedProcedure
    .input(z.object({
      seriesId: z.string(),
      videoId: z.string(),
      episodeNum: z.number().int().positive().optional(),
      episodeTitle: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.seriesId },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此合集" });
      }

      // 如果要更新集数，检查是否冲突
      if (input.episodeNum) {
        const existing = await ctx.prisma.seriesEpisode.findFirst({
          where: {
            seriesId: input.seriesId,
            episodeNum: input.episodeNum,
            NOT: { videoId: input.videoId },
          },
        });

        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: `第 ${input.episodeNum} 集已存在` });
        }
      }

      return ctx.prisma.seriesEpisode.update({
        where: {
          seriesId_videoId: {
            seriesId: input.seriesId,
            videoId: input.videoId,
          },
        },
        data: {
          episodeNum: input.episodeNum,
          episodeTitle: input.episodeTitle,
        },
      });
    }),

  // 重新排序剧集
  reorderEpisodes: protectedProcedure
    .input(z.object({
      seriesId: z.string(),
      episodes: z.array(z.object({
        videoId: z.string(),
        episodeNum: z.number().int().positive(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const series = await ctx.prisma.series.findUnique({
        where: { id: input.seriesId },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      if (series.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权修改此合集" });
      }

      // 使用事务批量更新
      await ctx.prisma.$transaction(
        input.episodes.map(ep =>
          ctx.prisma.seriesEpisode.update({
            where: {
              seriesId_videoId: {
                seriesId: input.seriesId,
                videoId: ep.videoId,
              },
            },
            data: { episodeNum: ep.episodeNum },
          })
        )
      );

      return { success: true };
    }),
});
