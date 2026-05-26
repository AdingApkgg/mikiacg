import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { awardPoints } from "@/lib/points";
import { resolveRole } from "@/lib/group-permissions";
import { checkViewDedup } from "@/lib/view-dedup";
import {
  generateContentId,
  resolveAllTagIds,
  resolveTagNames,
  resolvePublishStatus,
  assertCanUpload,
  assertOwnership,
  assertBatchLimit,
  scheduleTagCountRefresh,
} from "@/server/publish-utils";
import { meili, INDEX, safeSync } from "@/lib/meilisearch";
import { syncImagePost, deleteImagePost } from "@/lib/search-sync";
import { shouldMeiliListSearch, imageListMeiliFilter, imageListMeiliSort } from "@/lib/meili-filters";
import { submitImagePostToIndexNow, submitImagePostsToIndexNow } from "@/lib/indexnow";
import {
  addWhereAnd,
  imagePublicationDateWhere,
  imagePublicationOrderBy,
  shouldRefreshPublishedAt,
} from "@/lib/publication";

export const imageRouter = router({
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page, tagId, tagSlugs, excludeTagSlugs, search, sortBy, timeRange } = input;

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

      const where: Prisma.ImagePostWhereInput = { status: "PUBLISHED" };

      if (tagId) {
        where.tags = { some: { tagId } };
      }

      if (tagSlugs?.length) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : []),
          ...tagSlugs.map((slug) => ({
            tags: { some: { tag: { slug } } },
          })),
        ];
      }

      if (excludeTagSlugs?.length) {
        where.NOT = excludeTagSlugs.map((slug) => ({
          tags: { some: { tag: { slug } } },
        }));
      }

      if (timeFilter) {
        addWhereAnd(where, imagePublicationDateWhere({ gte: timeFilter }));
      }

      const listInclude = {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
      } as const;

      if (shouldMeiliListSearch(search)) {
        const q = search!.trim();
        const filter = imageListMeiliFilter({ tagId, tagSlugs, excludeTagSlugs, timeFilter });
        const offset = (page - 1) * limit;
        const msRes = await meili.index(INDEX.image).search(q, {
          limit,
          offset,
          filter,
          sort: imageListMeiliSort(sortBy),
          attributesToRetrieve: ["id"],
        });
        const ids = msRes.hits.map((h: Record<string, unknown>) => String(h.id));
        const rows = await ctx.prisma.imagePost.findMany({
          where: { id: { in: ids }, status: "PUBLISHED" },
          include: listInclude,
        });
        const byId = new Map(rows.map((p) => [p.id, p] as const));
        const posts = ids.map((id: string) => byId.get(id)).filter((p): p is (typeof rows)[number] => Boolean(p));
        const totalCount = msRes.estimatedTotalHits ?? msRes.hits.length;
        return {
          posts,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: page,
        };
      }

      const orderBy = {
        latest: imagePublicationOrderBy,
        views: { views: "desc" as const },
        likes: { likes: { _count: "desc" as const } },
        titleAsc: { title: "asc" as const },
        titleDesc: { title: "desc" as const },
      }[sortBy];

      const skip = (page - 1) * limit;

      const [posts, totalCount] = await Promise.all([
        ctx.prisma.imagePost.findMany({
          take: limit,
          skip,
          where,
          orderBy,
          include: listInclude,
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

  /** 获取指定用户的图片帖子（公开） */
  getUserPosts: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where: Prisma.ImagePostWhereInput = {
        uploaderId: input.userId,
        status: "PUBLISHED",
      };

      const [posts, totalCount] = await Promise.all([
        ctx.prisma.imagePost.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: imagePublicationOrderBy,
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

  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
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
        isNsfw: z.boolean().default(false),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, tagNames, ...data } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      const postId = await generateContentId(ctx.prisma, "imagePost");
      const allTagIds = await resolveAllTagIds(ctx.prisma, tagIds, tagNames);
      const status = resolvePublishStatus(user.role);

      const post = await ctx.prisma.imagePost.create({
        data: {
          id: postId,
          title: data.title,
          description: data.description || null,
          images: data.images,
          isNsfw: data.isNsfw,
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          uploaderId: ctx.session.user.id,
          tags: { create: allTagIds.map((tagId) => ({ tagId })) },
        },
      });

      scheduleTagCountRefresh(allTagIds, "图片创建");
      void safeSync(syncImagePost(post.id));

      if (post.status === "PUBLISHED") {
        submitImagePostToIndexNow(post.id).catch(() => {});
      }

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
              isNsfw: z.boolean().default(false),
              tagNames: z.array(z.string()).optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);
      await assertBatchLimit(ctx.prisma, input.posts.length);
      const status = resolvePublishStatus(user.role);

      const allTagNames = new Set<string>();
      for (const p of input.posts) {
        for (const t of p.tagNames ?? []) allTagNames.add(t);
      }
      const tagNameToId = await resolveTagNames(ctx.prisma, [...allTagNames]);

      const results: { title: string; id?: string; error?: string; updated?: boolean }[] = [];
      const previousTagIds = new Set<string>();

      for (const postInput of input.posts) {
        try {
          const tagIds = (postInput.tagNames ?? []).map((n) => tagNameToId.get(n)).filter((id): id is string => !!id);

          const existing = await ctx.prisma.imagePost.findFirst({
            where: { title: postInput.title, uploaderId: ctx.session.user.id },
            select: { id: true, tags: { select: { tagId: true } } },
          });

          if (existing) {
            for (const t of existing.tags) previousTagIds.add(t.tagId);

            await ctx.prisma.tagOnImagePost.deleteMany({
              where: { imagePostId: existing.id },
            });
            await ctx.prisma.imagePost.update({
              where: { id: existing.id },
              data: {
                description: postInput.description || null,
                images: postInput.images,
                isNsfw: postInput.isNsfw,
                tags: { create: tagIds.map((tagId) => ({ tagId })) },
              },
            });
            results.push({ title: postInput.title, id: existing.id, updated: true });
          } else {
            const postId = await generateContentId(ctx.prisma, "imagePost");
            await ctx.prisma.imagePost.create({
              data: {
                id: postId,
                title: postInput.title,
                description: postInput.description || null,
                images: postInput.images,
                isNsfw: postInput.isNsfw,
                status,
                publishedAt: status === "PUBLISHED" ? new Date() : null,
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

      scheduleTagCountRefresh([...new Set([...previousTagIds, ...tagNameToId.values()])], "图片批量导入");

      const indexableIds: string[] = [];
      for (const r of results) {
        if (r.id && !r.error) {
          void safeSync(syncImagePost(r.id));
          if (status === "PUBLISHED") indexableIds.push(r.id);
        }
      }
      if (indexableIds.length > 0) {
        submitImagePostsToIndexNow(indexableIds).catch(() => {});
      }

      return { results };
    }),

  getForEdit: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
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
      select: { role: true, group: { select: { role: true } } },
    });
    const effectiveRole = resolveRole(user?.role ?? "USER", user?.group?.role);
    assertOwnership(post.uploaderId, ctx.session.user.id, effectiveRole, "无权编辑此图片帖");

    return post;
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(5000).optional(),
        images: z.array(z.string().url()).min(1).optional(),
        isNsfw: z.boolean().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, tagNames, ...data } = input;
      const user = await assertCanUpload(ctx.prisma, ctx.session.user.id);

      const post = await ctx.prisma.imagePost.findUnique({
        where: { id },
        select: { uploaderId: true, status: true },
      });
      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
      }
      assertOwnership(post.uploaderId, ctx.session.user.id, user.role, "只能编辑自己的图片帖");

      const status = resolvePublishStatus(user.role);

      const updateData: Prisma.ImagePostUpdateInput = { status };
      if (shouldRefreshPublishedAt(post.status, status)) updateData.publishedAt = new Date();
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description || null;
      if (data.images !== undefined) updateData.images = data.images;
      if (data.isNsfw !== undefined) updateData.isNsfw = data.isNsfw;

      await ctx.prisma.imagePost.update({
        where: { id },
        data: updateData,
      });

      if (tagIds !== undefined || tagNames !== undefined) {
        const oldTags = await ctx.prisma.tagOnImagePost.findMany({
          where: { imagePostId: id },
          select: { tagId: true },
        });
        const oldTagIds = oldTags.map((t) => t.tagId);

        await ctx.prisma.tagOnImagePost.deleteMany({ where: { imagePostId: id } });

        const allTagIds = await resolveAllTagIds(ctx.prisma, tagIds, tagNames);

        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnImagePost.createMany({
            data: allTagIds.map((tagId) => ({ imagePostId: id, tagId })),
            skipDuplicates: true,
          });
        }

        scheduleTagCountRefresh([...new Set([...oldTagIds, ...allTagIds])], "图片编辑");
      }

      void safeSync(syncImagePost(id));

      if (status === "PUBLISHED") {
        submitImagePostToIndexNow(id).catch(() => {});
      }

      return { success: true };
    }),

  /** 获取当前用户的图片帖子列表（含所有状态） */
  getMyPosts: protectedProcedure
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

      const where: Prisma.ImagePostWhereInput = {
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

      const [posts, totalCount] = await Promise.all([
        ctx.prisma.imagePost.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
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

  /** 获取当前用户所有图片帖子 ID（用于全选） */
  getMyPostIds: protectedProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { status, search } = input;

      const where: Prisma.ImagePostWhereInput = {
        uploaderId: ctx.session.user.id,
        ...(status !== "ALL" && { status: status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        ...(search && { title: { contains: search, mode: Prisma.QueryMode.insensitive } }),
      };

      const posts = await ctx.prisma.imagePost.findMany({
        where,
        select: { id: true },
      });

      return posts.map((p) => p.id);
    }),

  /** 删除图片帖子（仅限上传者） */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const post = await ctx.prisma.imagePost.findUnique({
      where: { id: input.id },
      select: { uploaderId: true, tags: { select: { tagId: true } } },
    });

    if (!post) {
      throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
    }

    if (post.uploaderId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此图片帖" });
    }

    const tagIds = post.tags.map((t) => t.tagId);

    await ctx.prisma.imagePost.delete({ where: { id: input.id } });

    void safeSync(deleteImagePost(input.id));

    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 图片删除后刷新失败", err);
      });
    }

    return { success: true };
  }),

  /** 批量删除图片帖子（仅限上传者） */
  batchDelete: protectedProcedure.input(z.object({ ids: z.array(z.string()) })).mutation(async ({ ctx, input }) => {
    const posts = await ctx.prisma.imagePost.findMany({
      where: {
        id: { in: input.ids },
        uploaderId: ctx.session.user.id,
      },
      select: { id: true, tags: { select: { tagId: true } } },
    });

    if (posts.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "没有找到可删除的图片帖" });
    }

    const postIds = posts.map((p) => p.id);
    const tagIds = [...new Set(posts.flatMap((p) => p.tags.map((t) => t.tagId)))];

    await ctx.prisma.imagePost.deleteMany({
      where: { id: { in: postIds } },
    });

    for (const pid of postIds) {
      void safeSync(deleteImagePost(pid));
    }

    if (tagIds.length > 0) {
      const { refreshTagCounts } = await import("@/lib/tag-counts");
      refreshTagCounts(tagIds).catch((err) => {
        console.error("[tag-counts] 图片批量删除后刷新失败", err);
      });
    }

    return { success: true, count: postIds.length };
  }),

  // ==================== 用户交互 ====================

  toggleReaction: protectedProcedure
    .input(
      z.object({
        imagePostId: z.string(),
        type: z.enum(["like", "dislike"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { imagePostId, type } = input;

      if (type === "like") {
        const existing = await ctx.prisma.imagePostLike.findUnique({
          where: { userId_imagePostId: { userId, imagePostId } },
        });
        if (existing) {
          await ctx.prisma.imagePostLike.delete({ where: { id: existing.id } });
          return { liked: false, disliked: false };
        }
        await ctx.prisma.$transaction([
          ctx.prisma.imagePostLike.create({ data: { userId, imagePostId } }),
          ctx.prisma.imagePostDislike.deleteMany({ where: { userId, imagePostId } }),
        ]);
        const pointsAwarded = await awardPoints(userId, "LIKE_IMAGE", undefined, imagePostId, { firstTimeOnly: true });
        return { liked: true, disliked: false, pointsAwarded };
      } else {
        const existing = await ctx.prisma.imagePostDislike.findUnique({
          where: { userId_imagePostId: { userId, imagePostId } },
        });
        if (existing) {
          await ctx.prisma.imagePostDislike.delete({ where: { id: existing.id } });
          return { liked: false, disliked: false };
        }
        await ctx.prisma.$transaction([
          ctx.prisma.imagePostDislike.create({ data: { userId, imagePostId } }),
          ctx.prisma.imagePostLike.deleteMany({ where: { userId, imagePostId } }),
        ]);
        return { liked: false, disliked: true };
      }
    }),

  /**
   * 批量查询当前登录用户已收藏的图集 ID。
   * 用于列表卡片显示心形按钮的填充态。未登录返回空数组。
   */
  favoritedMap: publicProcedure
    .input(z.object({ imagePostIds: z.array(z.string()).max(60) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id;
      if (!userId || input.imagePostIds.length === 0) return { favoritedIds: [] as string[] };
      const records = await ctx.prisma.imagePostFavorite.findMany({
        where: { userId, imagePostId: { in: input.imagePostIds } },
        select: { imagePostId: true },
      });
      return { favoritedIds: records.map((r) => r.imagePostId) };
    }),

  toggleFavorite: protectedProcedure.input(z.object({ imagePostId: z.string() })).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const existing = await ctx.prisma.imagePostFavorite.findUnique({
      where: { userId_imagePostId: { userId, imagePostId: input.imagePostId } },
    });

    if (existing) {
      await ctx.prisma.imagePostFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await ctx.prisma.imagePostFavorite.create({
      data: { userId, imagePostId: input.imagePostId },
    });
    const pointsAwarded = await awardPoints(userId, "FAVORITE_IMAGE", undefined, input.imagePostId, {
      firstTimeOnly: true,
    });
    return { favorited: true, pointsAwarded };
  }),

  getUserInteraction: protectedProcedure.input(z.object({ imagePostId: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const [liked, disliked, favorited] = await Promise.all([
      ctx.prisma.imagePostLike.findUnique({
        where: { userId_imagePostId: { userId, imagePostId: input.imagePostId } },
      }),
      ctx.prisma.imagePostDislike.findUnique({
        where: { userId_imagePostId: { userId, imagePostId: input.imagePostId } },
      }),
      ctx.prisma.imagePostFavorite.findUnique({
        where: { userId_imagePostId: { userId, imagePostId: input.imagePostId } },
      }),
    ]);
    return { liked: !!liked, disliked: !!disliked, favorited: !!favorited };
  }),

  incrementViews: publicProcedure
    .input(z.object({ id: z.string(), visitorId: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const dedup = await checkViewDedup({
        type: "image",
        contentId: input.id,
        visitorId: input.visitorId,
        ipv4: ctx.ipv4Address,
        ipv6: ctx.ipv6Address,
      });
      if (!dedup.allow) return { success: true, deduplicated: true, reason: dedup.reason };
      await ctx.prisma.imagePost.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });
      return { success: true };
    }),

  recordView: protectedProcedure.input(z.object({ imagePostId: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.imagePostViewHistory.findUnique({
      where: {
        userId_imagePostId: {
          userId: ctx.session.user.id,
          imagePostId: input.imagePostId,
        },
      },
      select: { id: true },
    });

    await ctx.prisma.imagePostViewHistory.upsert({
      where: {
        userId_imagePostId: {
          userId: ctx.session.user.id,
          imagePostId: input.imagePostId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        userId: ctx.session.user.id,
        imagePostId: input.imagePostId,
      },
    });

    let pointsAwarded = 0;
    if (!existing) {
      pointsAwarded = await awardPoints(ctx.session.user.id, "VIEW_IMAGE", undefined, input.imagePostId);
    }
    return { success: true, pointsAwarded };
  }),

  // ==================== 公开列表（用户主页用） ====================

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
        imagePost: { status: "PUBLISHED" as const },
      };

      const [favorites, totalCount] = await Promise.all([
        ctx.prisma.imagePostFavorite.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            imagePost: {
              include: {
                uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
                tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.imagePostFavorite.count({ where }),
      ]);

      return {
        posts: favorites.filter((f) => f.imagePost !== null).map((f) => f.imagePost),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

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
        imagePost: { status: "PUBLISHED" as const },
      };

      const [likes, totalCount] = await Promise.all([
        ctx.prisma.imagePostLike.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            imagePost: {
              include: {
                uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
                tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.imagePostLike.count({ where }),
      ]);

      return {
        posts: likes.filter((l) => l.imagePost !== null).map((l) => l.imagePost),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

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
        imagePost: { status: "PUBLISHED" as const },
      };

      const [history, totalCount] = await Promise.all([
        ctx.prisma.imagePostViewHistory.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            imagePost: {
              include: {
                uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
                tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
                _count: { select: { likes: true, dislikes: true, favorites: true, comments: true } },
              },
            },
          },
        }),
        ctx.prisma.imagePostViewHistory.count({ where }),
      ]);

      return {
        posts: history.filter((h) => h.imagePost !== null).map((h) => h.imagePost),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),
});
