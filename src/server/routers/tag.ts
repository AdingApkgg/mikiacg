import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { router, publicProcedure, adminProcedure } from "../trpc";
import { getOrSet, deleteCachePattern } from "@/lib/redis";

/** 标签所属内容类型 */
const tagTypeSchema = z.enum(["video", "game"]).optional();

// 缓存键
const CACHE_KEYS = {
  tagBySlug: (slug: string, type: string) => `tag:slug:${slug}:${type}`,
  tagList: (search: string, limit: number, type: string) =>
    `tag:list:${search || "all"}:${limit}:${type}`,
  popularTags: (limit: number, type: string) => `tag:popular:${limit}:${type}`,
};

// 缓存时间（秒）
const CACHE_TTL = {
  tag: 300,
  list: 300,
  popular: 600,
};

/** 根据 type 构造 where / orderBy / _count */
function tagQueryHelpers(type?: "video" | "game") {
  if (type === "game") {
    return {
      hasContent: { games: { some: {} } } satisfies Prisma.TagWhereInput,
      countSelect: { games: true } as const,
      orderByCount: { games: { _count: "desc" as const } },
    };
  }
  if (type === "video") {
    return {
      hasContent: { videos: { some: {} } } satisfies Prisma.TagWhereInput,
      countSelect: { videos: true } as const,
      orderByCount: { videos: { _count: "desc" as const } },
    };
  }
  // 不传 type 时返回所有标签，计数取视频数
  return {
    hasContent: {} satisfies Prisma.TagWhereInput,
    countSelect: { videos: true, games: true } as const,
    orderByCount: { name: "asc" as const },
  };
}

export const tagRouter = router({
  // 根据 slug 获取标签
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string(), type: z.enum(["video", "game"]).default("video") }))
    .query(async ({ ctx, input }) => {
      const h = tagQueryHelpers(input.type);
      return getOrSet(
        CACHE_KEYS.tagBySlug(input.slug, input.type),
        async () => {
          const tag = await ctx.prisma.tag.findUnique({
            where: { slug: input.slug },
            include: {
              _count: { select: h.countSelect },
            },
          });
          return tag;
        },
        CACHE_TTL.tag
      );
    }),

  // 获取所有标签
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        type: tagTypeSchema,
      })
    )
    .query(async ({ ctx, input }) => {
      const h = tagQueryHelpers(input.type);

      if (input.search) {
        return ctx.prisma.tag.findMany({
          take: input.limit,
          where: {
            name: { contains: input.search, mode: "insensitive" },
            ...h.hasContent,
          },
          include: { _count: { select: h.countSelect } },
          orderBy: { name: "asc" },
        });
      }

      return getOrSet(
        CACHE_KEYS.tagList("", input.limit, input.type),
        async () => {
          return ctx.prisma.tag.findMany({
            take: input.limit,
            where: h.hasContent,
            include: { _count: { select: h.countSelect } },
            orderBy: { name: "asc" },
          });
        },
        CACHE_TTL.list
      );
    }),

  // 热门标签
  popular: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(10),
        type: z.enum(["video", "game"]).default("video"),
      })
    )
    .query(async ({ ctx, input }) => {
      const h = tagQueryHelpers(input.type);
      return getOrSet(
        CACHE_KEYS.popularTags(input.limit, input.type),
        async () => {
          return ctx.prisma.tag.findMany({
            take: input.limit,
            where: h.hasContent,
            include: { _count: { select: h.countSelect } },
            orderBy: h.orderByCount,
          });
        },
        CACHE_TTL.popular
      );
    }),

  // 创建标签
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30),
        slug: z.string().min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.tag.create({
        data: input,
      });

      await deleteCachePattern("tag:*");

      return tag;
    }),

  // 删除标签
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tag.delete({
        where: { id: input.id },
      });

      await deleteCachePattern("tag:*");

      return { success: true };
    }),
});
