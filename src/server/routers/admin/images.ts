import { router, adminProcedure, requireScope } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { safeSync } from "@/lib/meilisearch";
import { syncImagePost, deleteImagePost } from "@/lib/search-sync";
import { submitImagePostToIndexNow, submitImagePostsToIndexNow } from "@/lib/indexnow";

export const adminImagesRouter = router({
  // ========== 图片管理 ==========

  getImageStats: adminProcedure.use(requireScope("video:moderate")).query(async ({ ctx }) => {
    const [total, pending, published, rejected] = await Promise.all([
      ctx.prisma.imagePost.count(),
      ctx.prisma.imagePost.count({ where: { status: "PENDING" } }),
      ctx.prisma.imagePost.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.imagePost.count({ where: { status: "REJECTED" } }),
    ]);

    return { total, pending, published, rejected };
  }),

  listAllImages: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, search } = input;
      const skip = (page - 1) * limit;

      const where: Prisma.ImagePostWhereInput = {};
      if (status !== "ALL") {
        where.status = status;
      }
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const [images, totalCount] = await Promise.all([
        ctx.prisma.imagePost.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            tags: {
              include: { tag: { select: { id: true, name: true, slug: true } } },
            },
          },
        }),
        ctx.prisma.imagePost.count({ where }),
      ]);

      return {
        images,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  moderateImage: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        imageId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.imagePost.update({
        where: { id: input.imageId },
        data: { status: input.status },
      });

      // 首次过审时设置 publishedAt（已设置则保留原值）
      if (input.status === "PUBLISHED") {
        await ctx.prisma.imagePost.updateMany({
          where: { id: input.imageId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }

      void safeSync(syncImagePost(input.imageId));

      if (input.status === "PUBLISHED") {
        submitImagePostToIndexNow(input.imageId).catch(() => {});
      }

      return { success: true };
    }),

  deleteImage: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.imagePost.delete({ where: { id: input.imageId } });
      void safeSync(deleteImagePost(input.imageId));
      return { success: true };
    }),

  getAllImageIds: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;
      const where: Prisma.ImagePostWhereInput = {};
      if (status !== "ALL") where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ];
      }

      const images = await ctx.prisma.imagePost.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      return images.map((i) => i.id);
    }),

  batchModerateImages: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(1000),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.imagePost.updateMany({
        where: { id: { in: input.imageIds } },
        data: { status: input.status },
      });

      if (input.status === "PUBLISHED") {
        await ctx.prisma.imagePost.updateMany({
          where: { id: { in: input.imageIds }, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }

      for (const pid of input.imageIds) {
        void safeSync(syncImagePost(pid));
      }

      if (input.status === "PUBLISHED") {
        submitImagePostsToIndexNow(input.imageIds).catch(() => {});
      }

      return { success: true, count: result.count };
    }),

  batchDeleteImages: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ imageIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.imagePost.deleteMany({
        where: { id: { in: input.imageIds } },
      });

      for (const pid of input.imageIds) {
        void safeSync(deleteImagePost(pid));
      }

      return { success: true, count: result.count };
    }),

  batchImageRegexPreview: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(500),
        field: z.enum(["title", "description", "images"]),
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

      const posts = await ctx.prisma.imagePost.findMany({
        where: { id: { in: input.imageIds } },
        select: { id: true, title: true, description: true, images: true },
      });

      const previews: { id: string; title: string; before: string; after: string }[] = [];

      for (const post of posts) {
        if (input.field === "images") {
          const urls = (post.images ?? []) as string[];
          const originals = urls.map((s) => s ?? "");
          const replaced = originals.map((o) => o.replace(regex, input.replacement));
          const beforeLines: string[] = [];
          const afterLines: string[] = [];
          for (let i = 0; i < originals.length; i++) {
            if (originals[i] !== replaced[i]) {
              beforeLines.push(originals[i]);
              afterLines.push(replaced[i]);
            }
          }
          if (beforeLines.length > 0) {
            previews.push({
              id: post.id,
              title: post.title,
              before: beforeLines.join("\n"),
              after: afterLines.join("\n"),
            });
          }
        } else {
          const original = ((post as Record<string, unknown>)[input.field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            previews.push({ id: post.id, title: post.title, before: original, after: replaced });
          }
        }
      }

      return { previews, totalMatched: previews.length, totalSelected: posts.length };
    }),

  batchImageRegexUpdate: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(500),
        field: z.enum(["title", "description", "images"]),
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

      const posts = await ctx.prisma.imagePost.findMany({
        where: { id: { in: input.imageIds } },
        select: { id: true, title: true, description: true, images: true },
      });

      let updatedCount = 0;

      for (const post of posts) {
        if (input.field === "images") {
          const urls = (post.images ?? []) as string[];
          const replaced = urls.map((u) => u.replace(regex, input.replacement));
          const changed = urls.some((u, i) => u !== replaced[i]);
          if (changed) {
            await ctx.prisma.imagePost.update({
              where: { id: post.id },
              data: { images: replaced },
            });
            void safeSync(syncImagePost(post.id));
            updatedCount++;
          }
        } else {
          const original = ((post as Record<string, unknown>)[input.field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            await ctx.prisma.imagePost.update({
              where: { id: post.id },
              data: { [input.field]: replaced || null },
            });
            void safeSync(syncImagePost(post.id));
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),
});
