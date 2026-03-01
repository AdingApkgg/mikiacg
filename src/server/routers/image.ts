import { z } from "zod";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

async function generateImagePostId(prisma: PrismaClient): Promise<string> {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const randomNum = Math.floor(Math.random() * 1000000);
    const id = randomNum.toString().padStart(6, "0");
    const existing = await prisma.imagePost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return id;
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "无法生成唯一图片帖 ID，请稍后重试",
  });
}

export const imageRouter = router({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
        tagId: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views"]).default("latest"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, search, sortBy } = input;

      const where: Prisma.ImagePostWhereInput = { status: "PUBLISHED" };

      if (tagId) {
        where.tags = { some: { tagId } };
      }
      if (search) {
        where.OR = [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ];
      }

      const orderBy = sortBy === "views"
        ? { views: "desc" as const }
        : { createdAt: "desc" as const };

      const skip = (page - 1) * limit;

      const [posts, totalCount] = await Promise.all([
        ctx.prisma.imagePost.findMany({
          take: limit,
          skip,
          where,
          orderBy,
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
        posts,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.prisma.imagePost.findUnique({
        where: { id: input.id },
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
        },
      });

      if (!post || (post.status !== "PUBLISHED" && post.uploaderId !== ctx.session?.user?.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
      }

      await ctx.prisma.imagePost.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });

      return post;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, "请输入标题").max(200),
        description: z.string().max(5000).optional(),
        images: z.array(z.string().url()).min(1, "至少上传一张图片"),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, tagNames, ...data } = input;

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

      const postId = await generateImagePostId(ctx.prisma);

      const tagConnections: { tagId: string }[] = [];
      if (tagIds?.length) {
        for (const id of tagIds) tagConnections.push({ tagId: id });
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

      const status = isPrivileged ? "PUBLISHED" : "PENDING";

      const post = await ctx.prisma.imagePost.create({
        data: {
          id: postId,
          title: data.title,
          description: data.description || null,
          images: data.images,
          status,
          uploaderId: ctx.session.user.id,
          tags: { create: tagConnections },
        },
      });

      return { id: post.id, status: post.status };
    }),

  batchCreate: protectedProcedure
    .input(
      z.object({
        posts: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              description: z.string().max(5000).optional(),
              images: z.array(z.string().url()).min(1),
              tagNames: z.array(z.string()).optional(),
            })
          )
          .min(1)
          .max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const allTagNames = new Set<string>();
      for (const p of input.posts) {
        for (const t of p.tagNames ?? []) allTagNames.add(t);
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

      const results: { title: string; id?: string; error?: string; updated?: boolean }[] = [];

      for (const postInput of input.posts) {
        try {
          const tagIds = (postInput.tagNames ?? [])
            .map((n) => tagNameToId.get(n))
            .filter((id): id is string => !!id);

          const existing = await ctx.prisma.imagePost.findFirst({
            where: { title: postInput.title },
            select: { id: true },
          });

          if (existing) {
            await ctx.prisma.tagOnImagePost.deleteMany({
              where: { imagePostId: existing.id },
            });
            await ctx.prisma.imagePost.update({
              where: { id: existing.id },
              data: {
                description: postInput.description || null,
                images: postInput.images,
                tags: { create: tagIds.map((tagId) => ({ tagId })) },
              },
            });
            results.push({ title: postInput.title, id: existing.id, updated: true });
          } else {
            const postId = await generateImagePostId(ctx.prisma);
            await ctx.prisma.imagePost.create({
              data: {
                id: postId,
                title: postInput.title,
                description: postInput.description || null,
                images: postInput.images,
                status,
                uploaderId: ctx.session.user.id,
                tags: { create: tagIds.map((tagId) => ({ tagId })) },
              },
            });
            results.push({ title: postInput.title, id: postId });
          }
        } catch (err) {
          results.push({
            title: postInput.title,
            error: err instanceof Error ? err.message : "未知错误",
          });
        }
      }

      return { results };
    }),

  getForEdit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const post = await ctx.prisma.imagePost.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
        },
      });

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      const isPrivileged = user?.role === "ADMIN" || user?.role === "OWNER";

      if (post.uploaderId !== ctx.session.user.id && !isPrivileged) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此图片帖" });
      }

      return post;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        images: z.array(z.string().url()).min(1).optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, tagNames, ...data } = input;

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true, canUpload: true },
      });
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
      }
      const isPrivileged = user.role === "ADMIN" || user.role === "OWNER";
      if (!isPrivileged && !user.canUpload) {
        throw new TRPCError({ code: "FORBIDDEN", message: "暂无编辑权限" });
      }

      const post = await ctx.prisma.imagePost.findUnique({
        where: { id },
        select: { uploaderId: true },
      });
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
      }
      if (post.uploaderId !== ctx.session.user.id && !isPrivileged) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能编辑自己的图片帖" });
      }

      const updateData: Prisma.ImagePostUpdateInput = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description || null;
      if (data.images !== undefined) updateData.images = data.images;

      await ctx.prisma.imagePost.update({
        where: { id },
        data: updateData,
      });

      if (tagIds !== undefined || tagNames !== undefined) {
        await ctx.prisma.tagOnImagePost.deleteMany({ where: { imagePostId: id } });

        const allTagIds: string[] = [...(tagIds || [])];
        if (tagNames?.length) {
          for (const tagName of tagNames) {
            const slug = tagName.toLowerCase().replace(/\s+/g, "-");
            const tag = await ctx.prisma.tag.upsert({
              where: { slug },
              update: {},
              create: { name: tagName, slug },
            });
            if (!allTagIds.includes(tag.id)) {
              allTagIds.push(tag.id);
            }
          }
        }

        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnImagePost.createMany({
            data: allTagIds.map((tagId) => ({ imagePostId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      return { success: true };
    }),
});
