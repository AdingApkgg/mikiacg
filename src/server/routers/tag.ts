import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc";
import { getOrSet, deleteCachePattern } from "@/lib/redis";

// 缓存键
const CACHE_KEYS = {
  tagBySlug: (slug: string) => `tag:slug:${slug}`,
  tagList: (search: string, limit: number) => `tag:list:${search || "all"}:${limit}`,
  popularTags: (limit: number) => `tag:popular:${limit}`,
};

// 缓存时间（秒）
const CACHE_TTL = {
  tag: 300, // 5 分钟
  list: 300, // 5 分钟
  popular: 600, // 10 分钟（热门标签变化较慢）
};

export const tagRouter = router({
  // 根据 slug 获取标签
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      return getOrSet(CACHE_KEYS.tagBySlug(input.slug), async () => {
        const tag = await ctx.prisma.tag.findUnique({
          where: { slug: input.slug },
          include: {
            _count: { select: { videos: true } },
          },
        });
        return tag;
      }, CACHE_TTL.tag);
    }),

  // 获取所有标签
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      // 有搜索条件时不缓存（搜索组合太多，缓存命中率低）
      if (input.search) {
        return ctx.prisma.tag.findMany({
          take: input.limit,
          where: {
            name: { contains: input.search, mode: "insensitive" },
          },
          include: {
            _count: { select: { videos: true } },
          },
          orderBy: { name: "asc" },
        });
      }

      return getOrSet(CACHE_KEYS.tagList("", input.limit), async () => {
        return ctx.prisma.tag.findMany({
          take: input.limit,
          include: {
            _count: { select: { videos: true } },
          },
          orderBy: { name: "asc" },
        });
      }, CACHE_TTL.list);
    }),

  // 热门标签
  popular: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return getOrSet(CACHE_KEYS.popularTags(input.limit), async () => {
        return ctx.prisma.tag.findMany({
          take: input.limit,
          include: {
            _count: { select: { videos: true } },
          },
          orderBy: {
            videos: { _count: "desc" },
          },
        });
      }, CACHE_TTL.popular);
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

      // 清除标签相关缓存（通配符模式）
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

      // 清除标签相关缓存（通配符模式）
      await deleteCachePattern("tag:*");

      return { success: true };
    }),
});
