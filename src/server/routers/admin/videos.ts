import { router, adminProcedure, requireScope } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { nanoid } from "nanoid";
import { parseShortcode } from "@/lib/shortcode-parser";
import { enqueueCoverForVideo } from "@/lib/cover-auto";
import { createNotification } from "@/lib/notification";
import { safeSync } from "@/lib/meilisearch";
import { syncVideo, deleteVideo as deleteVideoSearchIndex } from "@/lib/search-sync";
import { resolveTagNames } from "@/server/publish-utils";

export const adminVideosRouter = router({
  // ========== 视频管理 ==========

  // 视频统计
  getVideoStats: adminProcedure.use(requireScope("video:moderate")).query(async ({ ctx }) => {
    const [total, published, pending, rejected] = await Promise.all([
      ctx.prisma.video.count(),
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.video.count({ where: { status: "PENDING" } }),
      ctx.prisma.video.count({ where: { status: "REJECTED" } }),
    ]);

    return { total, published, pending, rejected };
  }),

  // 获取所有视频列表（分页版）
  listAllVideos: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "titleAsc", "titleDesc"]).default("latest"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search, sortBy } = input;

      const where: Prisma.VideoWhereInput = {
        ...(status !== "ALL" && { status }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { coverUrl: { contains: search, mode: "insensitive" as const } },
            { videoUrl: { contains: search, mode: "insensitive" as const } },
          ],
        }),
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
          skip: (page - 1) * limit,
          take: limit,
          where,
          orderBy,
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            tags: { include: { tag: true } },
            _count: { select: { likes: true, favorites: true, comments: true } },
          },
        }),
        ctx.prisma.video.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return { videos, totalCount, totalPages, currentPage: page };
    }),

  // 获取所有视频 ID（用于全选）
  getAllVideoIds: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;

      const where: Prisma.VideoWhereInput = {
        ...(status !== "ALL" && { status }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { coverUrl: { contains: search, mode: "insensitive" as const } },
            { videoUrl: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      };

      const videos = await ctx.prisma.video.findMany({
        where,
        select: { id: true },
      });

      return videos.map((v) => v.id);
    }),

  // 审核视频
  moderateVideo: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        videoId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { status: input.status },
        select: { id: true, title: true, status: true, uploaderId: true },
      });

      // 首次过审时记录 publishedAt（已设置则保留原值）
      if (input.status === "PUBLISHED") {
        await ctx.prisma.video.updateMany({
          where: { id: input.videoId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }

      if (video.uploaderId) {
        const statusText = input.status === "PUBLISHED" ? "已通过审核" : "未通过审核";
        createNotification({
          userId: video.uploaderId,
          type: "CONTENT_STATUS",
          title: `视频${statusText}`,
          content: `你的视频「${video.title}」${statusText}`,
          data: { videoId: video.id, status: input.status },
        }).catch(() => {});
      }

      void safeSync(syncVideo(input.videoId));

      return { success: true, video };
    }),

  // 删除视频（管理员）
  deleteVideo: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 获取视频所在的合集ID（删除前）
      const episodes = await ctx.prisma.seriesEpisode.findMany({
        where: { videoId: input.videoId },
        select: { seriesId: true },
      });
      const seriesIds = episodes.map((e) => e.seriesId);

      await ctx.prisma.video.delete({ where: { id: input.videoId } });

      void safeSync(deleteVideoSearchIndex(input.videoId));

      // 清理空合集
      if (seriesIds.length > 0) {
        await ctx.prisma.series.deleteMany({
          where: {
            id: { in: seriesIds },
            episodes: { none: {} },
          },
        });
      }

      return { success: true };
    }),

  // 批量审核视频
  batchModerateVideos: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(100),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds } },
        data: { status: input.status },
      });

      if (input.status === "PUBLISHED") {
        await ctx.prisma.video.updateMany({
          where: { id: { in: input.videoIds }, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }

      for (const vid of input.videoIds) {
        void safeSync(syncVideo(vid));
      }

      return { success: true, count: result.count };
    }),

  // 批量删除视频
  batchDeleteVideos: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // 获取视频所在的合集ID（删除前）
      const episodes = await ctx.prisma.seriesEpisode.findMany({
        where: { videoId: { in: input.videoIds } },
        select: { seriesId: true },
      });
      const seriesIds = [...new Set(episodes.map((e) => e.seriesId))];

      const result = await ctx.prisma.video.deleteMany({
        where: { id: { in: input.videoIds } },
      });

      for (const vid of input.videoIds) {
        void safeSync(deleteVideoSearchIndex(vid));
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

      return { success: true, count: result.count };
    }),

  // ========== 正则批量编辑 ==========

  // 正则批量编辑 - 预览
  batchRegexPreview: adminProcedure
    .use(requireScope("video:manage"))
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title",
          "description",
          "coverUrl",
          "videoUrl",
          "extraInfo.intro",
          "extraInfo.author",
          "extraInfo.authorIntro",
          "extraInfo.downloads.url",
          "extraInfo.downloads.name",
          "extraInfo.downloads.password",
          "extraInfo.relatedVideos",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      }),
    )
    .query(async ({ ctx, input }) => {
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.flags);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "无效的正则表达式" });
      }

      const videos = await ctx.prisma.video.findMany({
        where: { id: { in: input.videoIds } },
        select: { id: true, title: true, description: true, coverUrl: true, videoUrl: true, extraInfo: true },
      });

      const previews: { id: string; title: string; before: string; after: string; changed: boolean }[] = [];
      const field = input.field;
      const isExtraField = field.startsWith("extraInfo.");

      for (const video of videos) {
        if (!isExtraField) {
          const original = ((video as Record<string, unknown>)[field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            previews.push({ id: video.id, title: video.title, before: original, after: replaced, changed: true });
          }
        } else {
          const extra = (video.extraInfo ?? {}) as Record<string, unknown>;
          const subField = field.replace("extraInfo.", "");

          if (subField.startsWith("downloads.")) {
            const prop = subField.replace("downloads.", "") as "url" | "name" | "password";
            const downloads = (extra.downloads ?? []) as { name?: string; url?: string; password?: string }[];
            const beforeLines: string[] = [];
            const afterLines: string[] = [];
            for (const d of downloads) {
              const original = (d[prop] ?? "") as string;
              const replaced = original.replace(regex, input.replacement);
              if (original !== replaced) {
                beforeLines.push(original);
                afterLines.push(replaced);
              }
            }
            if (beforeLines.length > 0) {
              previews.push({
                id: video.id,
                title: video.title,
                before: beforeLines.join("\n"),
                after: afterLines.join("\n"),
                changed: true,
              });
            }
          } else if (subField === "relatedVideos") {
            const arr = (extra[subField] ?? []) as string[];
            const beforeLines: string[] = [];
            const afterLines: string[] = [];
            for (let i = 0; i < arr.length; i++) {
              const replaced = (arr[i] ?? "").replace(regex, input.replacement);
              if (arr[i] !== replaced) {
                beforeLines.push(arr[i]);
                afterLines.push(replaced);
              }
            }
            if (beforeLines.length > 0) {
              previews.push({
                id: video.id,
                title: video.title,
                before: beforeLines.join("\n"),
                after: afterLines.join("\n"),
                changed: true,
              });
            }
          } else {
            const original = (extra[subField] ?? "") as string;
            const replaced = original.replace(regex, input.replacement);
            if (original !== replaced) {
              previews.push({ id: video.id, title: video.title, before: original, after: replaced, changed: true });
            }
          }
        }
      }

      return { previews, totalMatched: previews.length, totalSelected: videos.length };
    }),

  // 正则批量编辑 - 执行
  batchRegexUpdate: adminProcedure
    .use(requireScope("video:manage"))
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title",
          "description",
          "coverUrl",
          "videoUrl",
          "extraInfo.intro",
          "extraInfo.author",
          "extraInfo.authorIntro",
          "extraInfo.downloads.url",
          "extraInfo.downloads.name",
          "extraInfo.downloads.password",
          "extraInfo.relatedVideos",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.flags);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "无效的正则表达式" });
      }

      const videos = await ctx.prisma.video.findMany({
        where: { id: { in: input.videoIds } },
        select: { id: true, title: true, description: true, coverUrl: true, videoUrl: true, extraInfo: true },
      });

      let updatedCount = 0;
      const field = input.field;
      const isExtraField = field.startsWith("extraInfo.");

      for (const video of videos) {
        if (!isExtraField) {
          const original = ((video as Record<string, unknown>)[field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            await ctx.prisma.video.update({
              where: { id: video.id },
              data: { [field]: replaced || null },
            });
            void safeSync(syncVideo(video.id));
            updatedCount++;
          }
        } else {
          const extra = (video.extraInfo ?? {}) as Record<string, unknown>;
          const subField = field.replace("extraInfo.", "");
          let changed = false;
          const newExtra = { ...extra };

          if (subField.startsWith("downloads.")) {
            const prop = subField.replace("downloads.", "") as "url" | "name" | "password";
            const downloads = [...((extra.downloads ?? []) as { name?: string; url?: string; password?: string }[])];
            for (let i = 0; i < downloads.length; i++) {
              const original = (downloads[i][prop] ?? "") as string;
              const replaced = original.replace(regex, input.replacement);
              if (original !== replaced) {
                downloads[i] = { ...downloads[i], [prop]: replaced || undefined };
                changed = true;
              }
            }
            if (changed) newExtra.downloads = downloads;
          } else if (subField === "relatedVideos") {
            const arr = [...((extra[subField] ?? []) as string[])];
            for (let i = 0; i < arr.length; i++) {
              const replaced = (arr[i] ?? "").replace(regex, input.replacement);
              if (arr[i] !== replaced) {
                arr[i] = replaced;
                changed = true;
              }
            }
            if (changed) newExtra[subField] = arr;
          } else {
            const original = (extra[subField] ?? "") as string;
            const replaced = original.replace(regex, input.replacement);
            if (original !== replaced) {
              newExtra[subField] = replaced || undefined;
              changed = true;
            }
          }

          if (changed) {
            await ctx.prisma.video.update({
              where: { id: video.id },
              data: { extraInfo: newExtra as Prisma.InputJsonValue },
            });
            void safeSync(syncVideo(video.id));
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),

  // ========== 批量导入 ==========

  // 批量导入视频（解析短代码）
  batchImportVideos: adminProcedure
    .use(requireScope("video:manage"))
    .input(
      z.object({
        videos: z
          .array(
            z.object({
              title: z.string().min(1).max(100),
              videoUrl: z.string().url(),
              coverUrl: z.string().url().optional().or(z.literal("")),
              description: z.string().max(5000).optional(),
              shortcodeContent: z.string().optional(), // 原始短代码内容
              isNsfw: z.boolean().default(false),
              tagNames: z.array(z.string()).optional(),
              customId: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: { title: string; id?: string; error?: string }[] = [];

      for (const videoData of input.videos) {
        try {
          // 解析短代码内容
          let extraInfo = null;
          if (videoData.shortcodeContent) {
            extraInfo = parseShortcode(videoData.shortcodeContent);
          }

          // 处理标签
          const tagIds: string[] = [];
          if (videoData.tagNames && videoData.tagNames.length > 0) {
            // resolveTagNames \u5185\u90e8\u4f1a\u5265\u79bb (N) \u540e\u7f00 + \u901a\u8fc7 TagAlias \u5408\u5e76\u5386\u53f2\u91cd\u540d
            const nameToId = await resolveTagNames(ctx.prisma, videoData.tagNames);
            for (const id of nameToId.values()) tagIds.push(id);
          }

          // 检查自定义 ID 是否已存在
          if (videoData.customId) {
            const existing = await ctx.prisma.video.findUnique({
              where: { id: videoData.customId.toLowerCase() },
            });
            if (existing) {
              results.push({ title: videoData.title, error: `ID ${videoData.customId} 已存在` });
              continue;
            }
          }

          // 创建视频
          const video = await ctx.prisma.video.create({
            data: {
              id: videoData.customId ? videoData.customId.toLowerCase() : nanoid(10),
              title: videoData.title,
              description: videoData.description,
              videoUrl: videoData.videoUrl,
              coverUrl: videoData.coverUrl || null,
              isNsfw: videoData.isNsfw,
              status: "PUBLISHED",
              publishedAt: new Date(),
              extraInfo: extraInfo ? JSON.parse(JSON.stringify(extraInfo)) : undefined,
              uploader: { connect: { id: ctx.session.user.id } },
              ...(tagIds.length > 0
                ? { tags: { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
                : {}),
            },
          });

          enqueueCoverForVideo(video.id, video.coverUrl).catch(() => {});

          void safeSync(syncVideo(video.id));

          results.push({ title: videoData.title, id: video.id });
        } catch (error) {
          results.push({
            title: videoData.title,
            error: error instanceof Error ? error.message : "未知错误",
          });
        }
      }

      const successCount = results.filter((r) => r.id).length;
      const failCount = results.filter((r) => r.error).length;

      return {
        success: true,
        total: input.videos.length,
        successCount,
        failCount,
        results,
      };
    }),
});
