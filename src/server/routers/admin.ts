import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure, ownerProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/constants";
import { Prisma } from "@/generated/prisma/client";
import { nanoid } from "nanoid";
import { parseShortcode } from "@/lib/shortcode-parser";
import { enqueueCoverForVideo } from "@/lib/cover-auto";
import { addToQueueBatch } from "@/lib/cover-queue";
import { deleteCache, deleteCachePattern } from "@/lib/redis";
import { submitGameToIndexNow, submitGamesToIndexNow } from "@/lib/indexnow";

// 检查用户是否有特定权限
async function hasScope(
  prisma: typeof import("@/lib/prisma").prisma,
  userId: string,
  scope: AdminScope
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminScopes: true },
  });

  if (!user) return false;

  // 站长拥有所有权限
  if (user.role === "OWNER") return true;

  // 普通用户无管理权限
  if (user.role === "USER") return false;

  // 管理员检查 adminScopes
  const scopes = (user.adminScopes as string[]) || [];
  return scopes.includes(scope);
}

export const adminRouter = router({
  // 获取当前用户的管理权限信息
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { role: true, adminScopes: true },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const isOwner = user.role === "OWNER";
    const isAdmin = user.role === "ADMIN" || isOwner;
    const scopes = isOwner
      ? Object.keys(ADMIN_SCOPES)
      : ((user.adminScopes as string[]) || []);

    return {
      role: user.role,
      isOwner,
      isAdmin,
      scopes,
      allScopes: ADMIN_SCOPES,
    };
  }),

  // 公开统计数据（所有人可见）
  getPublicStats: publicProcedure.query(async ({ ctx }) => {
    const [
      userCount,
      videoCount,
      gameCount,
      imagePostCount,
      tagCount,
      seriesCount,
      searchCount,
      // Views
      videoViews,
      gameViews,
      imageViews,
      // Video interactions
      videoLikes,
      videoDislikes,
      videoFavorites,
      videoComments,
      // Game interactions
      gameLikes,
      gameDislikes,
      gameFavorites,
      gameComments,
      // Image interactions
      imagePostLikes,
      imagePostDislikes,
      imagePostFavorites,
      imagePostComments,
    ] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.game.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.imagePost.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.tag.count(),
      ctx.prisma.series.count(),
      ctx.prisma.searchRecord.count(),
      // Views
      ctx.prisma.video.aggregate({ where: { status: "PUBLISHED" }, _sum: { views: true } }),
      ctx.prisma.game.aggregate({ where: { status: "PUBLISHED" }, _sum: { views: true } }),
      ctx.prisma.imagePost.aggregate({ where: { status: "PUBLISHED" }, _sum: { views: true } }),
      // Video
      ctx.prisma.like.count(),
      ctx.prisma.dislike.count(),
      ctx.prisma.favorite.count(),
      ctx.prisma.comment.count({ where: { isDeleted: false } }),
      // Game
      ctx.prisma.gameLike.count(),
      ctx.prisma.gameDislike.count(),
      ctx.prisma.gameFavorite.count(),
      ctx.prisma.gameComment.count({ where: { isDeleted: false } }),
      // Image
      ctx.prisma.imagePostLike.count(),
      ctx.prisma.imagePostDislike.count(),
      ctx.prisma.imagePostFavorite.count(),
      ctx.prisma.imagePostComment.count({ where: { isDeleted: false } }),
    ]);

    return {
      userCount,
      videoCount,
      gameCount,
      imagePostCount,
      tagCount,
      seriesCount,
      searchCount,
      totalViews: (videoViews._sum.views || 0) + (gameViews._sum.views || 0) + (imageViews._sum.views || 0),
      videoViews: videoViews._sum.views || 0,
      gameViews: gameViews._sum.views || 0,
      imageViews: imageViews._sum.views || 0,
      totalLikes: videoLikes + gameLikes + imagePostLikes,
      totalDislikes: videoDislikes + gameDislikes + imagePostDislikes,
      totalFavorites: videoFavorites + gameFavorites + imagePostFavorites,
      totalComments: videoComments + gameComments + imagePostComments,
      video: { likes: videoLikes, dislikes: videoDislikes, favorites: videoFavorites, comments: videoComments },
      game: { likes: gameLikes, dislikes: gameDislikes, favorites: gameFavorites, comments: gameComments },
      image: { likes: imagePostLikes, dislikes: imagePostDislikes, favorites: imagePostFavorites, comments: imagePostComments },
    };
  }),

  getGrowthStats: publicProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const [
        newUsers,
        newVideos,
        newGames,
        newImagePosts,
        newTags,
        newSeries,
        newSearches,
        newVideoComments,
        newGameComments,
        newImageComments,
        newVideoViews,
        newGameViews,
        newImageViews,
        newVideoLikes,
        newGameLikes,
        newImageLikes,
        newVideoFavorites,
        newGameFavorites,
        newImageFavorites,
      ] = await Promise.all([
        ctx.prisma.user.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.video.count({ where: { createdAt: { gte: since }, status: "PUBLISHED" } }),
        ctx.prisma.game.count({ where: { createdAt: { gte: since }, status: "PUBLISHED" } }),
        ctx.prisma.imagePost.count({ where: { createdAt: { gte: since }, status: "PUBLISHED" } }),
        ctx.prisma.tag.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.series.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.searchRecord.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.comment.count({ where: { createdAt: { gte: since }, isDeleted: false } }),
        ctx.prisma.gameComment.count({ where: { createdAt: { gte: since }, isDeleted: false } }),
        ctx.prisma.imagePostComment.count({ where: { createdAt: { gte: since }, isDeleted: false } }),
        ctx.prisma.watchHistory.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.gameViewHistory.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.imagePostViewHistory.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.like.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.gameLike.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.imagePostLike.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.favorite.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.gameFavorite.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.imagePostFavorite.count({ where: { createdAt: { gte: since } } }),
      ]);

      return {
        days: input.days,
        newUsers,
        newVideos,
        newGames,
        newImagePosts,
        newTags,
        newSeries,
        newSearches,
        newComments: newVideoComments + newGameComments + newImageComments,
        newViews: newVideoViews + newGameViews + newImageViews,
        newLikes: newVideoLikes + newGameLikes + newImageLikes,
        newFavorites: newVideoFavorites + newGameFavorites + newImageFavorites,
      };
    }),

  // 增长趋势数据（每日统计）
  getGrowthTrend: publicProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = new Date(today);
      since.setDate(since.getDate() - input.days + 1);

      const [users, videos, images, games, videoViews, gameViews, imageViews, videoLikes, gameLikes, imageLikes, videoFavs, gameFavs, imageFavs, videoComments, gameComments, imageComments] = await Promise.all([
        ctx.prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.video.findMany({ where: { createdAt: { gte: since }, status: "PUBLISHED" }, select: { createdAt: true } }),
        ctx.prisma.imagePost.findMany({ where: { createdAt: { gte: since }, status: "PUBLISHED" }, select: { createdAt: true } }),
        ctx.prisma.game.findMany({ where: { createdAt: { gte: since }, status: "PUBLISHED" }, select: { createdAt: true } }),
        ctx.prisma.watchHistory.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.gameViewHistory.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.imagePostViewHistory.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.like.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.gameLike.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.imagePostLike.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.favorite.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.gameFavorite.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.imagePostFavorite.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        ctx.prisma.comment.findMany({ where: { createdAt: { gte: since }, isDeleted: false }, select: { createdAt: true } }),
        ctx.prisma.gameComment.findMany({ where: { createdAt: { gte: since }, isDeleted: false }, select: { createdAt: true } }),
        ctx.prisma.imagePostComment.findMany({ where: { createdAt: { gte: since }, isDeleted: false }, select: { createdAt: true } }),
      ]);

      type DayData = { users: number; videos: number; images: number; games: number; views: number; likes: number; favorites: number; comments: number };
      const trend: Record<string, DayData> = {};

      const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const empty = (): DayData => ({ users: 0, videos: 0, images: 0, games: 0, views: 0, likes: 0, favorites: 0, comments: 0 });

      for (let i = 0; i < input.days; i++) {
        const date = new Date(since);
        date.setDate(date.getDate() + i);
        trend[toKey(date)] = empty();
      }

      const inc = (rows: { createdAt: Date }[], field: keyof DayData) => {
        for (const r of rows) {
          const k = toKey(new Date(r.createdAt));
          if (trend[k]) trend[k][field]++;
        }
      };

      inc(users, "users");
      inc(videos, "videos");
      inc(images, "images");
      inc(games, "games");
      inc([...videoViews, ...gameViews, ...imageViews], "views");
      inc([...videoLikes, ...gameLikes, ...imageLikes], "likes");
      inc([...videoFavs, ...gameFavs, ...imageFavs], "favorites");
      inc([...videoComments, ...gameComments, ...imageComments], "comments");

      return Object.entries(trend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data }));
    }),

  // ========== 用户管理（站长专用）==========

  // 用户统计
  getUserStats: adminProcedure.query(async ({ ctx }) => {
    const canView = await hasScope(ctx.prisma, ctx.session.user.id, "user:view");
    if (!canView) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无用户查看权限" });
    }

    const [total, users, admins, owners, banned] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.user.count({ where: { role: "USER" } }),
      ctx.prisma.user.count({ where: { role: "ADMIN" } }),
      ctx.prisma.user.count({ where: { role: "OWNER" } }),
      ctx.prisma.user.count({ where: { isBanned: true } }),
    ]);

    return { total, users, admins, owners, banned };
  }),

  // 获取用户列表（管理员可查看，站长可管理）
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        page: z.number().min(1).default(1),
        search: z.string().optional(),
        role: z.enum(["ALL", "USER", "ADMIN", "OWNER"]).default("ALL"),
        banned: z.enum(["ALL", "BANNED", "ACTIVE"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canView = await hasScope(ctx.prisma, ctx.session.user.id, "user:view");
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户查看权限" });
      }

      const { limit, page } = input;
      const where = {
        ...(input.role !== "ALL" && { role: input.role }),
        ...(input.banned === "BANNED" && { isBanned: true }),
        ...(input.banned === "ACTIVE" && { isBanned: false }),
        ...(input.search && {
          OR: [
            { username: { contains: input.search, mode: "insensitive" as const } },
            { nickname: { contains: input.search, mode: "insensitive" as const } },
            { email: { contains: input.search, mode: "insensitive" as const } },
          ],
        }),
      };

      const [users, totalCount] = await Promise.all([
        ctx.prisma.user.findMany({
          skip: (page - 1) * limit,
          take: limit,
          where,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            role: true,
            adminScopes: true,
            isBanned: true,
            banReason: true,
            lastIpLocation: true,
            adsEnabled: true,
            createdAt: true,
            _count: { select: { videos: true, comments: true, likes: true } },
          },
        }),
        ctx.prisma.user.count({ where }),
      ]);

      return {
        users,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 封禁用户
  banUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (target.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能封禁站长" });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isBanned: true, banReason: input.reason, bannedAt: new Date() },
      });

      return { success: true };
    }),

  // 解封用户
  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isBanned: false, banReason: null, bannedAt: null },
      });

      return { success: true };
    }),

  // 批量封禁用户
  batchBanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const result = await ctx.prisma.user.updateMany({
        where: { id: { in: input.userIds }, role: { not: "OWNER" } },
        data: { isBanned: true, bannedAt: new Date() },
      });

      return { success: true, count: result.count };
    }),

  // 批量解封用户
  batchUnbanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const result = await ctx.prisma.user.updateMany({
        where: { id: { in: input.userIds } },
        data: { isBanned: false, banReason: null, bannedAt: null },
      });

      return { success: true, count: result.count };
    }),

  // 更新用户角色（站长专用）
  updateUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (targetUser.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能修改站长的角色" });
      }

      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: {
          role: input.role,
          // 降级为普通用户时清空权限
          ...(input.role === "USER" && { adminScopes: Prisma.DbNull }),
        },
        select: { id: true, username: true, role: true, adminScopes: true },
      });

      return { success: true, user };
    }),

  // 更新管理员权限范围（站长专用）
  updateAdminScopes: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        scopes: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (targetUser.role !== "ADMIN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只能为管理员分配权限" });
      }

      // 验证权限范围有效性
      const validScopes = input.scopes.filter((s) => s in ADMIN_SCOPES);

      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { adminScopes: validScopes },
        select: { id: true, username: true, role: true, adminScopes: true },
      });

      return { success: true, user };
    }),

  // 更新用户广告加载开关（站长或拥有 user:manage 的管理员）
  updateUserAdsEnabled: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        adsEnabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (targetUser.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能修改站长的设置" });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { adsEnabled: input.adsEnabled },
      });

      return { success: true };
    }),

  // ========== 视频管理 ==========

  // 视频统计
  getVideoStats: adminProcedure.query(async ({ ctx }) => {
    const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
    }

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
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes"]).default("latest"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

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

      const orderBy = sortBy === "views" 
        ? { views: 'desc' as const }
        : sortBy === "likes"
          ? { createdAt: 'desc' as const }
          : { createdAt: 'desc' as const };

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
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

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

      return videos.map(v => v.id);
    }),

  // 审核视频
  moderateVideo: adminProcedure
    .input(
      z.object({
        videoId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频审核权限" });
      }

      const video = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { status: input.status },
        select: { id: true, title: true, status: true },
      });

      return { success: true, video };
    }),

  // 删除视频（管理员）
  deleteVideo: adminProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      // 获取视频所在的合集ID（删除前）
      const episodes = await ctx.prisma.seriesEpisode.findMany({
        where: { videoId: input.videoId },
        select: { seriesId: true },
      });
      const seriesIds = episodes.map((e) => e.seriesId);

      await ctx.prisma.video.delete({ where: { id: input.videoId } });

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
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(100),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频审核权限" });
      }

      const result = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds } },
        data: { status: input.status },
      });

      return { success: true, count: result.count };
    }),

  // 批量删除视频
  batchDeleteVideos: adminProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      // 获取视频所在的合集ID（删除前）
      const episodes = await ctx.prisma.seriesEpisode.findMany({
        where: { videoId: { in: input.videoIds } },
        select: { seriesId: true },
      });
      const seriesIds = [...new Set(episodes.map((e) => e.seriesId))];

      const result = await ctx.prisma.video.deleteMany({
        where: { id: { in: input.videoIds } },
      });

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
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title", "description", "coverUrl", "videoUrl",
          "extraInfo.intro", "extraInfo.author", "extraInfo.authorIntro",
          "extraInfo.downloads.url", "extraInfo.downloads.name", "extraInfo.downloads.password",
          "extraInfo.relatedVideos",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

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
              previews.push({ id: video.id, title: video.title, before: beforeLines.join("\n"), after: afterLines.join("\n"), changed: true });
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
              previews.push({ id: video.id, title: video.title, before: beforeLines.join("\n"), after: afterLines.join("\n"), changed: true });
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
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title", "description", "coverUrl", "videoUrl",
          "extraInfo.intro", "extraInfo.author", "extraInfo.authorIntro",
          "extraInfo.downloads.url", "extraInfo.downloads.name", "extraInfo.downloads.password",
          "extraInfo.relatedVideos",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

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
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),

  // ========== 批量导入 ==========

  // 批量导入视频（解析短代码）
  batchImportVideos: adminProcedure
    .input(z.object({
      videos: z.array(z.object({
        title: z.string().min(1).max(100),
        videoUrl: z.string().url(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        description: z.string().max(5000).optional(),
        shortcodeContent: z.string().optional(), // 原始短代码内容
        tagNames: z.array(z.string()).optional(),
        customId: z.string().optional(),
      })).min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

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
            for (const tagName of videoData.tagNames) {
              const slug = tagName
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`;
              
              const tag = await ctx.prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName, slug },
              });
              tagIds.push(tag.id);
            }
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
              status: "PUBLISHED",
              extraInfo: extraInfo ? JSON.parse(JSON.stringify(extraInfo)) : undefined,
              uploader: { connect: { id: ctx.session.user.id } },
              ...(tagIds.length > 0 
                ? { tags: { create: tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
                : {}),
            },
          });

          enqueueCoverForVideo(video.id, video.coverUrl).catch(() => {});

          results.push({ title: videoData.title, id: video.id });
        } catch (error) {
          results.push({ 
            title: videoData.title, 
            error: error instanceof Error ? error.message : "未知错误" 
          });
        }
      }

      const successCount = results.filter(r => r.id).length;
      const failCount = results.filter(r => r.error).length;

      return { 
        success: true, 
        total: input.videos.length,
        successCount,
        failCount,
        results,
      };
    }),

  // ========== 标签分类管理 ==========

  listTagCategories: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
    if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

    return ctx.prisma.tagCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { tags: true } } },
    });
  }),

  createTagCategory: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(30),
      slug: z.string().min(1).max(30),
      color: z.string().max(20).default("#6366f1"),
      sortOrder: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const existing = await ctx.prisma.tagCategory.findFirst({
        where: { OR: [{ name: input.name }, { slug: input.slug }] },
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "分类名称或 slug 已存在" });

      const cat = await ctx.prisma.tagCategory.create({ data: input });
      await deleteCachePattern("tag:*");
      return { success: true, category: cat };
    }),

  updateTagCategory: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(30).optional(),
      slug: z.string().min(1).max(30).optional(),
      color: z.string().max(20).optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const { id, ...data } = input;
      const cat = await ctx.prisma.tagCategory.update({ where: { id }, data });
      await deleteCachePattern("tag:*");
      return { success: true, category: cat };
    }),

  deleteTagCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      await ctx.prisma.tagCategory.delete({ where: { id: input.id } });
      await deleteCachePattern("tag:*");
      return { success: true };
    }),

  // ========== 标签管理 ==========

  getTagStats: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
    if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

    const [tags, categoryCount] = await Promise.all([
      ctx.prisma.tag.findMany({
        select: { categoryId: true, _count: { select: { videos: true, games: true } } },
      }),
      ctx.prisma.tagCategory.count(),
    ]);

    const total = tags.length;
    const withVideos = tags.filter((t) => t._count.videos > 0).length;
    const withGames = tags.filter((t) => t._count.games > 0).length;
    const empty = tags.filter((t) => t._count.videos === 0 && t._count.games === 0).length;
    const uncategorized = tags.filter((t) => !t.categoryId).length;

    return { total, withVideos, withGames, empty, uncategorized, categoryCount };
  }),

  createTag: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      slug: z.string().min(1).max(50).optional(),
      categoryId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "");

      const existing = await ctx.prisma.tag.findFirst({
        where: { OR: [{ name: input.name }, { slug }] },
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "标签名称或 slug 已存在" });

      const tag = await ctx.prisma.tag.create({
        data: { name: input.name, slug, categoryId: input.categoryId || null },
      });
      await deleteCachePattern("tag:*");

      return { success: true, tag };
    }),

  listTags: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      page: z.number().min(1).default(1),
      search: z.string().optional(),
      categoryId: z.string().optional(),
      uncategorized: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const { limit, page } = input;
      const conditions: Prisma.TagWhereInput[] = [];

      if (input.search) {
        conditions.push({
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
          ],
        });
      }
      if (input.uncategorized) {
        conditions.push({ categoryId: null });
      } else if (input.categoryId) {
        conditions.push({ categoryId: input.categoryId });
      }

      const where: Prisma.TagWhereInput = conditions.length > 0 ? { AND: conditions } : {};

      const [tags, totalCount] = await Promise.all([
        ctx.prisma.tag.findMany({
          skip: (page - 1) * limit,
          take: limit,
          where,
          orderBy: { createdAt: "desc" },
          include: {
            category: true,
            _count: { select: { videos: true, games: true } },
          },
        }),
        ctx.prisma.tag.count({ where }),
      ]);

      return {
        tags,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  updateTag: adminProcedure
    .input(z.object({
      tagId: z.string(),
      name: z.string().min(1).max(50).optional(),
      slug: z.string().min(1).max(50).optional(),
      categoryId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const { tagId, ...data } = input;
      const tag = await ctx.prisma.tag.update({ where: { id: tagId }, data });
      await deleteCachePattern("tag:*");

      return { success: true, tag };
    }),

  // 批量修改标签分类
  batchUpdateTagCategory: adminProcedure
    .input(z.object({
      tagIds: z.array(z.string()).min(1).max(100),
      categoryId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const result = await ctx.prisma.tag.updateMany({
        where: { id: { in: input.tagIds } },
        data: { categoryId: input.categoryId },
      });
      await deleteCachePattern("tag:*");

      return { success: true, count: result.count };
    }),

  deleteTag: adminProcedure
    .input(z.object({ tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      await ctx.prisma.tag.delete({ where: { id: input.tagId } });
      await deleteCachePattern("tag:*");

      return { success: true };
    }),

  batchDeleteTags: adminProcedure
    .input(z.object({ tagIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const result = await ctx.prisma.tag.deleteMany({
        where: { id: { in: input.tagIds } },
      });
      await deleteCachePattern("tag:*");

      return { success: true, count: result.count };
    }),

  mergeTags: adminProcedure
    .input(z.object({
      sourceTagIds: z.array(z.string()).min(1).max(100),
      targetTagId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });

      const targetTag = await ctx.prisma.tag.findUnique({ where: { id: input.targetTagId } });
      if (!targetTag) throw new TRPCError({ code: "NOT_FOUND", message: "目标标签不存在" });

      const sourceVideos = await ctx.prisma.video.findMany({
        where: { tags: { some: { tagId: { in: input.sourceTagIds } } } },
        select: { id: true },
      });

      for (const video of sourceVideos) {
        await ctx.prisma.tagOnVideo.upsert({
          where: { videoId_tagId: { videoId: video.id, tagId: input.targetTagId } },
          create: { videoId: video.id, tagId: input.targetTagId },
          update: {},
        });
        await ctx.prisma.tagOnVideo.deleteMany({
          where: { videoId: video.id, tagId: { in: input.sourceTagIds } },
        });
      }

      const sourceGames = await ctx.prisma.game.findMany({
        where: { tags: { some: { tagId: { in: input.sourceTagIds } } } },
        select: { id: true },
      });

      for (const game of sourceGames) {
        await ctx.prisma.tagOnGame.upsert({
          where: { gameId_tagId: { gameId: game.id, tagId: input.targetTagId } },
          create: { gameId: game.id, tagId: input.targetTagId },
          update: {},
        });
        await ctx.prisma.tagOnGame.deleteMany({
          where: { gameId: game.id, tagId: { in: input.sourceTagIds } },
        });
      }

      await ctx.prisma.tag.deleteMany({ where: { id: { in: input.sourceTagIds } } });
      await deleteCachePattern("tag:*");

      return { success: true, mergedCount: input.sourceTagIds.length };
    }),

  // ========== 评论管理 ==========

  // 获取评论列表
  listComments: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        page: z.number().min(1).default(1),
        search: z.string().optional(),
        status: z.enum(["ALL", "VISIBLE", "HIDDEN", "DELETED"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const { limit, page } = input;
      const where = {
        ...(input.search && {
          OR: [
            { content: { contains: input.search, mode: "insensitive" as const } },
            { user: { username: { contains: input.search, mode: "insensitive" as const } } },
            { user: { nickname: { contains: input.search, mode: "insensitive" as const } } },
            { video: { title: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }),
        ...(input.status === "VISIBLE" && { isDeleted: false, isHidden: false }),
        ...(input.status === "HIDDEN" && { isHidden: true, isDeleted: false }),
        ...(input.status === "DELETED" && { isDeleted: true }),
      };

      type AdminComment = Prisma.CommentGetPayload<{
        include: {
          user: { select: { id: true; username: true; nickname: true; avatar: true } };
          video: { select: { id: true; title: true } };
        };
      }>;

      const [comments, totalCount] = await Promise.all([
        ctx.prisma.comment.findMany({
          skip: (page - 1) * limit,
          take: limit,
          where,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, username: true, nickname: true, avatar: true } },
            video: { select: { id: true, title: true } },
          },
        }) as Promise<AdminComment[]>,
        ctx.prisma.comment.count({ where }),
      ]);

      return {
        comments,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  // 隐藏/显示评论
  toggleCommentHidden: adminProcedure
    .input(z.object({ commentId: z.string(), isHidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isHidden: input.isHidden },
      });

      return { success: true };
    }),

  // 删除评论（软删除）
  deleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isDeleted: true },
      });

      return { success: true };
    }),

  // 恢复评论
  restoreComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isDeleted: false },
      });

      return { success: true };
    }),

  // 评论统计
  getCommentStats: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
    }

    const [total, visible, hidden, deleted] = await Promise.all([
      ctx.prisma.comment.count(),
      ctx.prisma.comment.count({ where: { isDeleted: false, isHidden: false } }),
      ctx.prisma.comment.count({ where: { isHidden: true, isDeleted: false } }),
      ctx.prisma.comment.count({ where: { isDeleted: true } }),
    ]);

    return { total, visible, hidden, deleted };
  }),

  // 批量评论操作
  batchCommentAction: adminProcedure
    .input(
      z.object({
        commentIds: z.array(z.string()).min(1).max(100),
        action: z.enum(["hide", "show", "delete", "restore"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const data = (() => {
        switch (input.action) {
          case "hide":
            return { isHidden: true };
          case "show":
            return { isHidden: false };
          case "delete":
            return { isDeleted: true };
          case "restore":
            return { isDeleted: false };
        }
      })();

      const result = await ctx.prisma.comment.updateMany({
        where: { id: { in: input.commentIds } },
        data,
      });

      return { success: true, count: result.count };
    }),

  // 硬删除评论（彻底删除）
  hardDeleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      // 先删除所有子评论（回复）
      await ctx.prisma.comment.deleteMany({
        where: { parentId: input.commentId },
      });

      // 删除评论的所有反应
      await ctx.prisma.commentReaction.deleteMany({
        where: { commentId: input.commentId },
      });

      // 删除评论本身
      await ctx.prisma.comment.delete({
        where: { id: input.commentId },
      });

      return { success: true };
    }),

  // 批量硬删除评论
  batchHardDeleteComments: adminProcedure
    .input(z.object({ commentIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      // 先删除所有子评论
      await ctx.prisma.comment.deleteMany({
        where: { parentId: { in: input.commentIds } },
      });

      // 删除评论的所有反应
      await ctx.prisma.commentReaction.deleteMany({
        where: { commentId: { in: input.commentIds } },
      });

      // 删除评论
      const result = await ctx.prisma.comment.deleteMany({
        where: { id: { in: input.commentIds } },
      });

      return { success: true, count: result.count };
    }),

  // ========== 游戏评论管理 ==========

  listGameComments: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        page: z.number().min(1).default(1),
        search: z.string().optional(),
        status: z.enum(["ALL", "VISIBLE", "HIDDEN", "DELETED"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const { limit, page } = input;
      const where = {
        ...(input.search && {
          OR: [
            { content: { contains: input.search, mode: "insensitive" as const } },
            { user: { username: { contains: input.search, mode: "insensitive" as const } } },
            { user: { nickname: { contains: input.search, mode: "insensitive" as const } } },
            { game: { title: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }),
        ...(input.status === "VISIBLE" && { isDeleted: false, isHidden: false }),
        ...(input.status === "HIDDEN" && { isHidden: true, isDeleted: false }),
        ...(input.status === "DELETED" && { isDeleted: true }),
      };

      type AdminGameComment = Prisma.GameCommentGetPayload<{
        include: {
          user: { select: { id: true; username: true; nickname: true; avatar: true } };
          game: { select: { id: true; title: true } };
        };
      }>;

      const [comments, totalCount] = await Promise.all([
        ctx.prisma.gameComment.findMany({
          skip: (page - 1) * limit,
          take: limit,
          where,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, username: true, nickname: true, avatar: true } },
            game: { select: { id: true, title: true } },
          },
        }) as Promise<AdminGameComment[]>,
        ctx.prisma.gameComment.count({ where }),
      ]);

      return {
        comments,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  toggleGameCommentHidden: adminProcedure
    .input(z.object({ commentId: z.string(), isHidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.gameComment.update({
        where: { id: input.commentId },
        data: { isHidden: input.isHidden },
      });

      return { success: true };
    }),

  deleteGameComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.gameComment.update({
        where: { id: input.commentId },
        data: { isDeleted: true },
      });

      return { success: true };
    }),

  restoreGameComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.gameComment.update({
        where: { id: input.commentId },
        data: { isDeleted: false },
      });

      return { success: true };
    }),

  getGameCommentStats: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
    }

    const [total, visible, hidden, deleted] = await Promise.all([
      ctx.prisma.gameComment.count(),
      ctx.prisma.gameComment.count({ where: { isDeleted: false, isHidden: false } }),
      ctx.prisma.gameComment.count({ where: { isHidden: true, isDeleted: false } }),
      ctx.prisma.gameComment.count({ where: { isDeleted: true } }),
    ]);

    return { total, visible, hidden, deleted };
  }),

  batchGameCommentAction: adminProcedure
    .input(
      z.object({
        commentIds: z.array(z.string()).min(1).max(100),
        action: z.enum(["hide", "show", "delete", "restore"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const data = (() => {
        switch (input.action) {
          case "hide":
            return { isHidden: true };
          case "show":
            return { isHidden: false };
          case "delete":
            return { isDeleted: true };
          case "restore":
            return { isDeleted: false };
        }
      })();

      const result = await ctx.prisma.gameComment.updateMany({
        where: { id: { in: input.commentIds } },
        data,
      });

      return { success: true, count: result.count };
    }),

  hardDeleteGameComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.gameComment.deleteMany({
        where: { parentId: input.commentId },
      });

      await ctx.prisma.gameCommentReaction.deleteMany({
        where: { commentId: input.commentId },
      });

      await ctx.prisma.gameComment.delete({
        where: { id: input.commentId },
      });

      return { success: true };
    }),

  batchHardDeleteGameComments: adminProcedure
    .input(z.object({ commentIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.gameComment.deleteMany({
        where: { parentId: { in: input.commentIds } },
      });

      await ctx.prisma.gameCommentReaction.deleteMany({
        where: { commentId: { in: input.commentIds } },
      });

      const result = await ctx.prisma.gameComment.deleteMany({
        where: { id: { in: input.commentIds } },
      });

      return { success: true, count: result.count };
    }),

  // ========== 网站配置 ==========

  // 获取网站配置
  getSiteConfig: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
    }

    let config = await ctx.prisma.siteConfig.findUnique({
      where: { id: "default" },
    });

    if (!config) {
      try {
        config = await ctx.prisma.siteConfig.create({
          data: { id: "default" },
        });
      } catch (e) {
        // 并发时可能已被其他请求创建，再查一次
        config = await ctx.prisma.siteConfig.findUnique({
          where: { id: "default" },
        });
        if (!config) throw e;
      }
    }

    return config;
  }),

  // 更新网站配置
  updateSiteConfig: adminProcedure
    .input(z.object({
      // 基本信息
      siteName: z.string().min(1).max(100).optional(),
      siteUrl: z.string().url().optional().nullable().or(z.literal("")),
      siteDescription: z.string().max(500).optional().nullable(),
      siteLogo: z.string().url().optional().nullable().or(z.literal("")),
      siteFavicon: z.string().url().optional().nullable().or(z.literal("")),
      siteKeywords: z.string().max(500).optional().nullable(),
      
      // SEO / 验证
      googleVerification: z.string().max(200).optional().nullable().or(z.literal("")),
      githubUrl: z.string().url().optional().nullable().or(z.literal("")),
      securityEmail: z.string().email().optional().nullable().or(z.literal("")),
      
      // 公告
      announcement: z.string().max(2000).optional().nullable(),
      announcementEnabled: z.boolean().optional(),
      
      // 功能开关
      allowRegistration: z.boolean().optional(),
      allowUpload: z.boolean().optional(),
      allowComment: z.boolean().optional(),
      requireLoginToComment: z.boolean().optional(),
      requireEmailVerify: z.boolean().optional(),
      
      // 内容设置
      videosPerPage: z.number().int().min(5).max(100).optional(),
      commentsPerPage: z.number().int().min(5).max(100).optional(),
      maxUploadSize: z.number().int().min(10).max(10000).optional(),
      allowedVideoFormats: z.string().max(200).optional(),
      
      // 联系方式
      contactEmail: z.string().email().optional().nullable().or(z.literal("")),
      socialLinks: z.record(z.string(), z.string()).optional().nullable(),
      
      // 页脚
      footerText: z.string().max(1000).optional().nullable(),
      footerLinks: z.array(z.object({
        label: z.string().min(1).max(50),
        url: z.string().url(),
      })).max(10).optional().nullable(),
      
      // 备案
      icpBeian: z.string().max(100).optional().nullable(),
      publicSecurityBeian: z.string().max(100).optional().nullable(),

      // 广告系统
      adsEnabled: z.boolean().optional(),

      // 广告门
      adGateEnabled: z.boolean().optional(),
      adGateViewsRequired: z.number().int().min(1).max(20).optional(),
      adGateHours: z.number().int().min(1).max(168).optional(),

      // 广告列表（统一管理，广告门和页面广告位共用）
      sponsorAds: z.array(z.object({
        title: z.string().min(1).max(200),
        platform: z.string().max(100).optional().default(""),
        url: z.string().url(),
        description: z.string().max(500).optional().default(""),
        imageUrl: z.string().max(2000).optional().default(""),
        weight: z.number().int().min(1).max(100).optional().default(1),
        enabled: z.boolean().optional().default(true),
      })).max(50).optional().nullable(),

      // 对象存储
      storageProvider: z.enum(["local", "s3", "r2", "minio", "oss", "cos"]).optional(),
      storageEndpoint: z.string().max(500).optional().nullable().or(z.literal("")),
      storageBucket: z.string().max(200).optional().nullable().or(z.literal("")),
      storageRegion: z.string().max(100).optional().nullable().or(z.literal("")),
      storageAccessKey: z.string().max(500).optional().nullable().or(z.literal("")),
      storageSecretKey: z.string().max(500).optional().nullable().or(z.literal("")),
      storageCustomDomain: z.string().max(500).optional().nullable().or(z.literal("")),
      storagePathPrefix: z.string().max(200).optional().nullable().or(z.literal("")),

      // 数据备份
      backupEnabled: z.boolean().optional(),
      backupIntervalHours: z.number().int().min(1).max(720).optional(),
      backupRetentionDays: z.number().int().min(1).max(365).optional(),
      backupIncludeUploads: z.boolean().optional(),
      backupIncludeConfig: z.boolean().optional(),

      // 视觉效果
      effectEnabled: z.boolean().optional(),
      effectType: z.enum(["sakura", "firefly", "snow", "stars", "aurora", "cyber", "none"]).optional(),
      effectDensity: z.number().int().min(1).max(100).optional(),
      effectSpeed: z.number().min(0.1).max(3.0).optional(),
      effectOpacity: z.number().min(0).max(1).optional(),
      effectColor: z.string().max(50).optional().nullable().or(z.literal("")),
      soundDefaultEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      // 仅保留 SiteConfig 存在的字段，空字符串转 null，并确保 Json 为可序列化值
      const allowedKeys = new Set([
        "siteName", "siteUrl", "siteDescription", "siteLogo", "siteFavicon", "siteKeywords",
        "googleVerification", "githubUrl", "securityEmail",
        "announcement", "announcementEnabled", "allowRegistration", "allowUpload",
        "allowComment", "requireLoginToComment", "requireEmailVerify", "videosPerPage", "commentsPerPage",
        "maxUploadSize", "allowedVideoFormats", "contactEmail", "socialLinks",
        "footerText", "footerLinks", "icpBeian", "publicSecurityBeian",
        "adsEnabled", "adGateEnabled", "adGateViewsRequired", "adGateHours", "sponsorAds",
        "storageProvider", "storageEndpoint", "storageBucket", "storageRegion",
        "storageAccessKey", "storageSecretKey", "storageCustomDomain", "storagePathPrefix",
        "backupEnabled", "backupIntervalHours", "backupRetentionDays",
        "backupIncludeUploads", "backupIncludeConfig",
        "effectEnabled", "effectType", "effectDensity", "effectSpeed",
        "effectOpacity", "effectColor", "soundDefaultEnabled",
      ]);
      const cleaned = Object.fromEntries(
        Object.entries(input)
          .filter(([key]) => allowedKeys.has(key))
          .map(([key, value]) => [key, value === "" ? null : value])
          .filter(([, value]) => value !== undefined)
      ) as Record<string, unknown>;

      // Json 字段传纯对象/数组，避免 Prisma 序列化问题
      if (Array.isArray(cleaned.sponsorAds)) {
        cleaned.sponsorAds = JSON.parse(JSON.stringify(cleaned.sponsorAds)) as Prisma.InputJsonValue;
      }
      if (cleaned.socialLinks != null && typeof cleaned.socialLinks === "object" && !Array.isArray(cleaned.socialLinks)) {
        cleaned.socialLinks = JSON.parse(JSON.stringify(cleaned.socialLinks)) as Prisma.InputJsonValue;
      }
      if (Array.isArray(cleaned.footerLinks)) {
        cleaned.footerLinks = JSON.parse(JSON.stringify(cleaned.footerLinks)) as Prisma.InputJsonValue;
      }

      const config = await ctx.prisma.siteConfig.upsert({
        where: { id: "default" },
        create: { id: "default", ...cleaned } as Prisma.SiteConfigCreateInput,
        update: cleaned as Prisma.SiteConfigUpdateInput,
      });

      // 清除站点配置缓存，使更改立即生效
      await deleteCache("site:config");

      // 备份配置变更时热更新调度器
      if (
        input.backupEnabled !== undefined ||
        input.backupIntervalHours !== undefined
      ) {
        try {
          const { restartBackupScheduler } = await import("@/lib/backup");
          restartBackupScheduler();
        } catch {
          // 开发环境可能不可用
        }
      }

      return config;
    }),

  // ==================== 配置备份与还原 ====================

  exportSiteConfig: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
    }

    const [config, friendLinks] = await Promise.all([
      ctx.prisma.siteConfig.findUnique({ where: { id: "default" } }),
      ctx.prisma.friendLink.findMany({ orderBy: { sort: "desc" } }),
    ]);

    if (!config) {
      throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
    }

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...exportable } = config;
    void _id; void _ca; void _ua;
    return {
      _exportedAt: new Date().toISOString(),
      _version: 2,
      ...exportable,
      _friendLinks: friendLinks.map(({ id: _fid, createdAt: _fc, updatedAt: _fu, ...rest }) => {
        void _fid; void _fc; void _fu;
        return rest;
      }),
    };
  }),

  importSiteConfig: adminProcedure
    .input(z.object({
      data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const { data } = input;

      const systemKeys = new Set(["_exportedAt", "_version", "_friendLinks", "id", "createdAt", "updatedAt"]);

      const allowedKeys = new Set([
        "siteName", "siteUrl", "siteDescription", "siteLogo", "siteFavicon", "siteKeywords",
        "googleVerification", "githubUrl", "securityEmail",
        "announcement", "announcementEnabled", "allowRegistration", "allowUpload",
        "allowComment", "requireLoginToComment", "requireEmailVerify", "videosPerPage", "commentsPerPage",
        "maxUploadSize", "allowedVideoFormats", "contactEmail", "socialLinks",
        "footerText", "footerLinks", "icpBeian", "publicSecurityBeian",
        "adsEnabled", "adGateEnabled", "adGateViewsRequired", "adGateHours", "sponsorAds",
        "storageProvider", "storageEndpoint", "storageBucket", "storageRegion",
        "storageAccessKey", "storageSecretKey", "storageCustomDomain", "storagePathPrefix",
        "backupEnabled", "backupIntervalHours", "backupRetentionDays",
        "backupIncludeUploads", "backupIncludeConfig",
        "effectEnabled", "effectType", "effectDensity", "effectSpeed",
        "effectOpacity", "effectColor", "soundDefaultEnabled",
      ]);

      const cleaned = Object.fromEntries(
        Object.entries(data)
          .filter(([key]) => !systemKeys.has(key) && allowedKeys.has(key))
          .filter(([, value]) => value !== undefined)
      ) as Record<string, unknown>;

      // 保证 Json 字段可序列化
      for (const jsonKey of ["sponsorAds", "socialLinks", "footerLinks"]) {
        if (cleaned[jsonKey] != null) {
          cleaned[jsonKey] = JSON.parse(JSON.stringify(cleaned[jsonKey])) as Prisma.InputJsonValue;
        }
      }

      let importedCount = Object.keys(cleaned).length;

      // 还原 SiteConfig
      if (importedCount > 0) {
        await ctx.prisma.siteConfig.upsert({
          where: { id: "default" },
          create: { id: "default", ...cleaned } as Prisma.SiteConfigCreateInput,
          update: cleaned as Prisma.SiteConfigUpdateInput,
        });
        await deleteCache("site:config");
      }

      // 还原友情链接
      const friendLinksData = data._friendLinks;
      if (Array.isArray(friendLinksData) && friendLinksData.length > 0) {
        await ctx.prisma.friendLink.deleteMany();
        for (const link of friendLinksData) {
          if (typeof link === "object" && link !== null && "name" in link && "url" in link) {
            const fl = link as Record<string, unknown>;
            await ctx.prisma.friendLink.create({
              data: {
                name: String(fl.name),
                url: String(fl.url),
                logo: fl.logo ? String(fl.logo) : null,
                description: fl.description ? String(fl.description) : null,
                sort: typeof fl.sort === "number" ? fl.sort : 0,
                visible: fl.visible !== false,
              },
            });
          }
        }
        importedCount += friendLinksData.length;
      }

      if (importedCount === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "导入数据为空或格式不正确" });
      }

      return { imported: importedCount };
    }),

  // 重置视频封面：清除匹配模式的封面URL并触发自动生成
  resetCovers: adminProcedure
    .input(z.object({
      // 匹配封面URL的模式，如 "/Picture/" 匹配合集封面
      urlPattern: z.string().min(1).max(200).optional(),
      // 指定合集ID，重置该合集下所有视频的封面
      seriesId: z.string().optional(),
      // 指定视频ID列表
      videoIds: z.array(z.string()).optional(),
      // 重置所有没有自动生成封面的视频（coverUrl 非空且不是本地路径）
      nonLocalOnly: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      // 构建查询条件
      const where: Prisma.VideoWhereInput = {
        coverUrl: { not: null },
      };

      if (input.videoIds && input.videoIds.length > 0) {
        where.id = { in: input.videoIds };
      } else if (input.seriesId) {
        where.seriesEpisodes = { some: { seriesId: input.seriesId } };
      }

      if (input.urlPattern) {
        where.coverUrl = { contains: input.urlPattern };
      } else if (input.nonLocalOnly) {
        // 非本地路径（自动生成的封面是 /api/cover/ 开头）
        where.coverUrl = { not: { startsWith: "/api/cover/" } };
        // 排除已经为空的
        where.AND = [{ coverUrl: { not: null } }, { coverUrl: { not: "" } }];
      }

      // 查找受影响的视频
      const videos = await ctx.prisma.video.findMany({
        where,
        select: { id: true, coverUrl: true },
        take: 500, // 安全限制
      });

      if (videos.length === 0) {
        return { resetCount: 0, queuedCount: 0 };
      }

      // 批量清除 coverUrl
      await ctx.prisma.video.updateMany({
        where: { id: { in: videos.map((v) => v.id) } },
        data: { coverUrl: null },
      });

      // 批量入队自动生成
      const queuedCount = await addToQueueBatch(videos.map((v) => v.id));

      return {
        resetCount: videos.length,
        queuedCount,
      };
    }),

  // ==================== 游戏管理 ====================

  /** 获取游戏用于编辑（管理员可编辑任意游戏） */
  getGameForEdit: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const game = await ctx.prisma.game.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
        },
      });

      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
      }

      return game;
    }),

  /** 游戏统计 */
  getGameStats: adminProcedure.query(async ({ ctx }) => {
    const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
    }

    const [total, pending, published, rejected] = await Promise.all([
      ctx.prisma.game.count(),
      ctx.prisma.game.count({ where: { status: "PENDING" } }),
      ctx.prisma.game.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.game.count({ where: { status: "REJECTED" } }),
    ]);

    return { total, pending, published, rejected };
  }),

  /** 获取所有游戏列表（分页版） */
  listAllGames: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        gameType: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const { page, limit, status, search, gameType } = input;
      const skip = (page - 1) * limit;

      const where: Prisma.GameWhereInput = {};
      if (status !== "ALL") {
        where.status = status;
      }
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { coverUrl: { contains: search, mode: "insensitive" } },
        ];
      }
      if (gameType) {
        where.gameType = gameType;
      }

      const [games, totalCount] = await Promise.all([
        ctx.prisma.game.findMany({
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

  /** 审核游戏 */
  moderateGame: adminProcedure
    .input(
      z.object({
        gameId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏审核权限" });
      }

      await ctx.prisma.game.update({
        where: { id: input.gameId },
        data: { status: input.status },
      });

      // 审核通过时通知搜索引擎索引
      if (input.status === "PUBLISHED") {
        submitGameToIndexNow(input.gameId).catch(() => {});
      }

      return { success: true };
    }),

  /** 删除游戏 */
  deleteGame: adminProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      await ctx.prisma.game.delete({ where: { id: input.gameId } });
      return { success: true };
    }),

  /** 创建游戏（管理员） */
  createGame: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        coverUrl: z.string().optional(),
        gameType: z.string().optional(),
        isFree: z.boolean().default(true),
        version: z.string().optional(),
        extraInfo: z.any().optional(),
        tagNames: z.array(z.string()).default([]),
        status: z.enum(["PENDING", "PUBLISHED"]).default("PUBLISHED"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      // 生成游戏 ID
      const maxAttempts = 100;
      let gameId = "";
      for (let i = 0; i < maxAttempts; i++) {
        const randomNum = Math.floor(Math.random() * 1000000);
        const id = randomNum.toString().padStart(6, "0");
        const existing = await ctx.prisma.game.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!existing) {
          gameId = id;
          break;
        }
      }
      if (!gameId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "无法生成唯一游戏 ID" });
      }

      // 处理标签
      const tagConnections = [];
      for (const tagName of input.tagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tag = await ctx.prisma.tag.upsert({
          where: { slug },
          update: {},
          create: { name: tagName, slug },
        });
        tagConnections.push({ tagId: tag.id });
      }

      const game = await ctx.prisma.game.create({
        data: {
          id: gameId,
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl,
          gameType: input.gameType,
          isFree: input.isFree,
          version: input.version,
          extraInfo: input.extraInfo || undefined,
          status: input.status,
          uploaderId: ctx.session.user.id,
          tags: {
            create: tagConnections,
          },
        },
      });

      // 发布状态时异步提交到 IndexNow
      if (input.status === "PUBLISHED") {
        submitGameToIndexNow(game.id).catch(() => {});
      }

      return game;
    }),

  /** 更新游戏 */
  updateGame: adminProcedure
    .input(
      z.object({
        gameId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        coverUrl: z.string().optional(),
        gameType: z.string().optional(),
        isFree: z.boolean().optional(),
        version: z.string().optional(),
        extraInfo: z.any().optional(),
        tagNames: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const { gameId, tagNames, ...updateData } = input;

      // 更新基本信息
      await ctx.prisma.game.update({
        where: { id: gameId },
        data: updateData,
      });

      // 如果提供了标签，更新标签关联
      if (tagNames) {
        await ctx.prisma.tagOnGame.deleteMany({ where: { gameId } });

        for (const tagName of tagNames) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");
          const tag = await ctx.prisma.tag.upsert({
            where: { slug },
            update: {},
            create: { name: tagName, slug },
          });
          await ctx.prisma.tagOnGame.create({
            data: { gameId, tagId: tag.id },
          });
        }
      }

      // 游戏更新后通知搜索引擎重新索引
      submitGameToIndexNow(gameId).catch(() => {});

      return { success: true };
    }),

  /** 获取所有游戏 ID（用于全选） */
  getAllGameIds: adminProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const { status, search } = input;
      const where: Prisma.GameWhereInput = {};
      if (status !== "ALL") where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" as const } },
          { description: { contains: search, mode: "insensitive" as const } },
        ];
      }

      const games = await ctx.prisma.game.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      return games.map((g) => g.id);
    }),

  /** 批量审核游戏 */
  batchModerateGames: adminProcedure
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(1000),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏审核权限" });
      }

      const result = await ctx.prisma.game.updateMany({
        where: { id: { in: input.gameIds } },
        data: { status: input.status },
      });

      // 批量审核通过时通知搜索引擎索引
      if (input.status === "PUBLISHED") {
        submitGamesToIndexNow(input.gameIds).catch(() => {});
      }

      return { success: true, count: result.count };
    }),

  /** 批量删除游戏 */
  batchDeleteGames: adminProcedure
    .input(z.object({ gameIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const result = await ctx.prisma.game.deleteMany({
        where: { id: { in: input.gameIds } },
      });

      return { success: true, count: result.count };
    }),

  // ========== 图片管理 ==========

  getImageStats: adminProcedure.query(async ({ ctx }) => {
    const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
    }

    const [total, pending, published, rejected] = await Promise.all([
      ctx.prisma.imagePost.count(),
      ctx.prisma.imagePost.count({ where: { status: "PENDING" } }),
      ctx.prisma.imagePost.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.imagePost.count({ where: { status: "REJECTED" } }),
    ]);

    return { total, pending, published, rejected };
  }),

  listAllImages: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

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
    .input(
      z.object({
        imageId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片审核权限" });
      }

      await ctx.prisma.imagePost.update({
        where: { id: input.imageId },
        data: { status: input.status },
      });

      return { success: true };
    }),

  deleteImage: adminProcedure
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

      await ctx.prisma.imagePost.delete({ where: { id: input.imageId } });
      return { success: true };
    }),

  getAllImageIds: adminProcedure
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

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
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(1000),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片审核权限" });
      }

      const result = await ctx.prisma.imagePost.updateMany({
        where: { id: { in: input.imageIds } },
        data: { status: input.status },
      });

      return { success: true, count: result.count };
    }),

  batchDeleteImages: adminProcedure
    .input(z.object({ imageIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

      const result = await ctx.prisma.imagePost.deleteMany({
        where: { id: { in: input.imageIds } },
      });

      return { success: true, count: result.count };
    }),

  batchImageRegexPreview: adminProcedure
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(500),
        field: z.enum(["title", "description", "images"]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

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
            previews.push({ id: post.id, title: post.title, before: beforeLines.join("\n"), after: afterLines.join("\n") });
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
    .input(
      z.object({
        imageIds: z.array(z.string()).min(1).max(500),
        field: z.enum(["title", "description", "images"]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

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
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),

  // ========== 导出功能 ==========

  exportVideos: adminProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(5000) }))
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      const videos = await ctx.prisma.video.findMany({
        where: { id: { in: input.videoIds } },
        include: {
          tags: { include: { tag: { select: { name: true } } } },
          seriesEpisodes: { select: { series: { select: { title: true } } } },
        },
      });

      return videos.map((v) => ({
        title: v.title,
        description: v.description || undefined,
        coverUrl: v.coverUrl || undefined,
        videoUrl: v.videoUrl,
        tagNames: v.tags.map((t) => t.tag.name),
        extraInfo: v.extraInfo || undefined,
        seriesTitle: v.seriesEpisodes[0]?.series?.title || undefined,
      }));
    }),

  exportGames: adminProcedure
    .input(z.object({ gameIds: z.array(z.string()).min(1).max(5000) }))
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      const games = await ctx.prisma.game.findMany({
        where: { id: { in: input.gameIds } },
        include: {
          tags: { include: { tag: { select: { name: true } } } },
        },
      });

      return games.map((g) => ({
        title: g.title,
        description: g.description || undefined,
        coverUrl: g.coverUrl || undefined,
        gameType: g.gameType || undefined,
        isFree: g.isFree,
        version: g.version || undefined,
        tagNames: g.tags.map((t) => t.tag.name),
        extraInfo: g.extraInfo || undefined,
      }));
    }),

  exportImages: adminProcedure
    .input(z.object({ imageIds: z.array(z.string()).min(1).max(5000) }))
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无图片管理权限" });
      }

      const posts = await ctx.prisma.imagePost.findMany({
        where: { id: { in: input.imageIds } },
        include: {
          tags: { include: { tag: { select: { name: true } } } },
        },
      });

      return posts.map((p) => ({
        title: p.title,
        description: p.description || undefined,
        images: p.images as string[],
        tagNames: p.tags.map((t) => t.tag.name),
      }));
    }),

  // ========== 友情链接管理 ==========

  listFriendLinks: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无设置管理权限" });
    }
    return ctx.prisma.friendLink.findMany({ orderBy: [{ sort: "desc" }, { createdAt: "desc" }] });
  }),

  createFriendLink: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        url: z.string().url(),
        logo: z.string().optional(),
        description: z.string().max(200).optional(),
        sort: z.number().int().default(0),
        visible: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无设置管理权限" });
      }
      return ctx.prisma.friendLink.create({ data: input });
    }),

  updateFriendLink: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        url: z.string().url().optional(),
        logo: z.string().optional(),
        description: z.string().max(200).optional(),
        sort: z.number().int().optional(),
        visible: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无设置管理权限" });
      }
      const { id, ...data } = input;
      return ctx.prisma.friendLink.update({ where: { id }, data });
    }),

  deleteFriendLink: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无设置管理权限" });
      }
      await ctx.prisma.friendLink.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ========== 游戏正则批量编辑 ==========

  // 直接列字段
  // extraInfo JSON 子字段用 "extraInfo.xxx" 格式表示

  // 正则批量编辑 - 预览
  batchGameRegexPreview: adminProcedure
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title", "description", "coverUrl", "gameType", "version",
          "extraInfo.downloads.url", "extraInfo.downloads.name", "extraInfo.downloads.password",
          "extraInfo.screenshots", "extraInfo.videos",
          "extraInfo.originalName", "extraInfo.authorUrl", "extraInfo.characterIntro",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.flags);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "无效的正则表达式" });
      }

      const games = await ctx.prisma.game.findMany({
        where: { id: { in: input.gameIds } },
        select: { id: true, title: true, description: true, coverUrl: true, gameType: true, version: true, extraInfo: true },
      });

      const previews: { id: string; title: string; before: string; after: string; changed: boolean }[] = [];
      const field = input.field;
      const isExtraField = field.startsWith("extraInfo.");

      for (const game of games) {
        if (!isExtraField) {
          const original = ((game as Record<string, unknown>)[field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            previews.push({ id: game.id, title: game.title, before: original, after: replaced, changed: true });
          }
        } else {
          const extra = (game.extraInfo ?? {}) as Record<string, unknown>;
          const subField = field.replace("extraInfo.", "");

          if (subField.startsWith("downloads.")) {
            const prop = subField.replace("downloads.", "") as "url" | "name" | "password";
            const downloads = (extra.downloads ?? []) as { name?: string; url?: string; password?: string }[];
            const originals = downloads.map((d) => (d[prop] ?? "") as string);
            const replaceds = originals.map((o) => o.replace(regex, input.replacement));
            const beforeLines: string[] = [];
            const afterLines: string[] = [];
            for (let i = 0; i < originals.length; i++) {
              if (originals[i] !== replaceds[i]) {
                beforeLines.push(originals[i]);
                afterLines.push(replaceds[i]);
              }
            }
            if (beforeLines.length > 0) {
              previews.push({ id: game.id, title: game.title, before: beforeLines.join("\n"), after: afterLines.join("\n"), changed: true });
            }
          } else if (subField === "screenshots" || subField === "videos") {
            const arr = (extra[subField] ?? []) as string[];
            const originals = arr.map((s) => s ?? "");
            const replaceds = originals.map((o) => o.replace(regex, input.replacement));
            const beforeLines: string[] = [];
            const afterLines: string[] = [];
            for (let i = 0; i < originals.length; i++) {
              if (originals[i] !== replaceds[i]) {
                beforeLines.push(originals[i]);
                afterLines.push(replaceds[i]);
              }
            }
            if (beforeLines.length > 0) {
              previews.push({ id: game.id, title: game.title, before: beforeLines.join("\n"), after: afterLines.join("\n"), changed: true });
            }
          } else {
            const original = (extra[subField] ?? "") as string;
            const replaced = original.replace(regex, input.replacement);
            if (original !== replaced) {
              previews.push({ id: game.id, title: game.title, before: original, after: replaced, changed: true });
            }
          }
        }
      }

      return { previews, totalMatched: previews.length, totalSelected: games.length };
    }),

  // 正则批量编辑 - 执行
  batchGameRegexUpdate: adminProcedure
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title", "description", "coverUrl", "gameType", "version",
          "extraInfo.downloads.url", "extraInfo.downloads.name", "extraInfo.downloads.password",
          "extraInfo.screenshots", "extraInfo.videos",
          "extraInfo.originalName", "extraInfo.authorUrl", "extraInfo.characterIntro",
        ]),
        pattern: z.string().min(1),
        replacement: z.string(),
        flags: z.string().default("g"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无游戏管理权限" });
      }

      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.flags);
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "无效的正则表达式" });
      }

      const games = await ctx.prisma.game.findMany({
        where: { id: { in: input.gameIds } },
        select: { id: true, title: true, description: true, coverUrl: true, gameType: true, version: true, extraInfo: true },
      });

      let updatedCount = 0;
      const field = input.field;
      const isExtraField = field.startsWith("extraInfo.");

      for (const game of games) {
        if (!isExtraField) {
          const original = ((game as Record<string, unknown>)[field] ?? "") as string;
          const replaced = original.replace(regex, input.replacement);
          if (original !== replaced) {
            await ctx.prisma.game.update({
              where: { id: game.id },
              data: { [field]: replaced || null },
            });
            updatedCount++;
          }
        } else {
          const extra = (game.extraInfo ?? {}) as Record<string, unknown>;
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
          } else if (subField === "screenshots" || subField === "videos") {
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
            await ctx.prisma.game.update({
              where: { id: game.id },
              data: { extraInfo: newExtra as Prisma.InputJsonValue },
            });
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),

  // ========== 数据备份 ==========

  listBackups: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(5).max(50).default(20),
    }).optional())
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;

      const [records, total] = await Promise.all([
        ctx.prisma.backupRecord.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        ctx.prisma.backupRecord.count(),
      ]);

      return {
        records: records.map((r) => ({
          ...r,
          size: r.size.toString(),
        })),
        total,
        page,
        pageSize,
      };
    }),

  triggerBackup: adminProcedure
    .input(z.object({
      includeDatabase: z.boolean().default(true),
      includeUploads: z.boolean().default(true),
      includeConfig: z.boolean().default(true),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const { createBackup } = await import("@/lib/backup");

      const running = await ctx.prisma.backupRecord.findFirst({
        where: { status: { in: ["PENDING", "RUNNING"] } },
      });
      if (running) {
        throw new TRPCError({ code: "CONFLICT", message: "已有备份任务正在进行" });
      }

      const id = await createBackup({
        type: "MANUAL",
        includeDatabase: input?.includeDatabase ?? true,
        includeUploads: input?.includeUploads ?? true,
        includeConfig: input?.includeConfig ?? true,
      });

      return { id };
    }),

  deleteBackup: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const { deleteBackupById } = await import("@/lib/backup");
      await deleteBackupById(input.id);
      return { success: true };
    }),

  getBackupDownloadUrl: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const record = await ctx.prisma.backupRecord.findUnique({
        where: { id: input.id },
      });
      if (!record || !record.storagePath || record.status !== "COMPLETED") {
        throw new TRPCError({ code: "NOT_FOUND", message: "备份文件不存在或未完成" });
      }

      const { getStorageConfig, getPresignedDownloadUrl } = await import("@/lib/s3-client");
      const storageConfig = await getStorageConfig();
      if (storageConfig.provider === "local") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "本地存储不支持下载链接" });
      }

      const url = await getPresignedDownloadUrl(storageConfig, record.storagePath, 3600);
      return { url };
    }),

  restoreBackup: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "settings:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无系统设置权限" });
      }

      const record = await ctx.prisma.backupRecord.findUnique({
        where: { id: input.id },
      });
      if (!record || record.status !== "COMPLETED") {
        throw new TRPCError({ code: "NOT_FOUND", message: "备份不存在或未完成" });
      }

      const { restoreBackupById } = await import("@/lib/backup");
      const result = await restoreBackupById(input.id);

      if (result.errors.length > 0 && !result.database && !result.uploads && !result.config) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.errors.join("; "),
        });
      }

      return result;
    }),

  // ==================== 合集管理 ====================

  getSeriesStats: adminProcedure.query(async ({ ctx }) => {
    const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
    }

    const [total, totalEpisodes] = await Promise.all([
      ctx.prisma.series.count(),
      ctx.prisma.seriesEpisode.count(),
    ]);

    return { total, totalEpisodes };
  }),

  listAllSeries: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      const { page, limit, search } = input;

      const where: Prisma.SeriesWhereInput = {};
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      const [series, totalCount] = await Promise.all([
        ctx.prisma.series.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { updatedAt: "desc" },
          include: {
            creator: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            _count: { select: { episodes: true } },
            episodes: {
              take: 1,
              orderBy: { episodeNum: "asc" },
              include: {
                video: {
                  select: { id: true, coverUrl: true, title: true },
                },
              },
            },
          },
        }),
        ctx.prisma.series.count({ where }),
      ]);

      return {
        series,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  getSeriesDetail: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      const series = await ctx.prisma.series.findUnique({
        where: { id: input.id },
        include: {
          creator: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          episodes: {
            orderBy: { episodeNum: "asc" },
            include: {
              video: {
                select: {
                  id: true,
                  title: true,
                  coverUrl: true,
                  videoUrl: true,
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

  adminUpdateSeries: adminProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(100).optional(),
      description: z.string().max(2000).optional().nullable(),
      coverUrl: z.string().optional().nullable(),
      downloadUrl: z.string().optional().nullable(),
      downloadNote: z.string().max(1000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      const series = await ctx.prisma.series.findUnique({
        where: { id: input.id },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      const { id, ...data } = input;
      const updateData: Prisma.SeriesUpdateInput = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.coverUrl !== undefined) updateData.coverUrl = data.coverUrl || null;
      if (data.downloadUrl !== undefined) updateData.downloadUrl = data.downloadUrl || null;
      if (data.downloadNote !== undefined) updateData.downloadNote = data.downloadNote;

      return ctx.prisma.series.update({
        where: { id },
        data: updateData,
      });
    }),

  adminDeleteSeries: adminProcedure
    .input(z.object({ seriesId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      const series = await ctx.prisma.series.findUnique({
        where: { id: input.seriesId },
      });

      if (!series) {
        throw new TRPCError({ code: "NOT_FOUND", message: "合集不存在" });
      }

      await ctx.prisma.series.delete({
        where: { id: input.seriesId },
      });

      return { success: true };
    }),

  adminRemoveEpisode: adminProcedure
    .input(z.object({
      seriesId: z.string(),
      videoId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      await ctx.prisma.seriesEpisode.delete({
        where: {
          seriesId_videoId: {
            seriesId: input.seriesId,
            videoId: input.videoId,
          },
        },
      });

      return { success: true };
    }),

  adminBatchDeleteSeries: adminProcedure
    .input(z.object({
      seriesIds: z.array(z.string()).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无合集管理权限" });
      }

      const result = await ctx.prisma.series.deleteMany({
        where: { id: { in: input.seriesIds } },
      });

      return { success: true, count: result.count };
    }),
});
