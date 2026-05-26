import { router, publicProcedure, protectedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ADMIN_SCOPES } from "@/lib/constants";
import { isOwner as isOwnerRole, isPrivileged } from "@/lib/permissions";
import { resolveAdminScopes, resolveRole } from "@/lib/group-permissions";
import {
  gamePublicationDateWhere,
  imagePublicationDateWhere,
  publicationDate,
  videoPublicationDateWhere,
} from "@/lib/publication";

const MAX_RANGE_DAYS = 90;
const DAY_MS = 1000 * 60 * 60 * 24;

const dateRangeInput = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((d) => new Date(d.to) >= new Date(d.from), { message: "结束日期不能早于开始日期" })
  .refine(
    (d) => {
      const days = computeDayCount(new Date(d.from), new Date(d.to));
      return days >= 1 && days <= MAX_RANGE_DAYS;
    },
    { message: `日期范围不能超过 ${MAX_RANGE_DAYS} 天` },
  );

function computeDayCount(from: Date, to: Date): number {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS) + 1;
}

export const adminStatsRouter = router({
  // 获取当前用户的管理权限信息
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        role: true,
        adminScopes: true,
        group: { select: { role: true, adminScopes: true } },
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const effectiveRole = resolveRole(user.role, user.group?.role);
    const isOwner = isOwnerRole(effectiveRole);
    const isAdmin = isPrivileged(effectiveRole);
    const groupAdminScopes = (user.group?.adminScopes as string[] | null) ?? null;
    const userAdminScopes = (user.adminScopes as string[] | null) ?? null;
    const scopes = resolveAdminScopes(effectiveRole, groupAdminScopes ?? userAdminScopes);

    return {
      role: effectiveRole,
      isOwner,
      isAdmin,
      scopes: scopes as string[],
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
      image: {
        likes: imagePostLikes,
        dislikes: imagePostDislikes,
        favorites: imagePostFavorites,
        comments: imagePostComments,
      },
    };
  }),

  getLeaderboard: publicProcedure
    .input(
      z.object({
        type: z.enum(["video", "game", "image", "uploader", "points", "commentator", "collector", "liker"]),
        metric: z.enum(["views", "likes", "favorites", "comments", "uploads", "downloads"]),
        limit: z.number().min(5).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { type, metric, limit } = input;

      // ========== 用户排行类别 ==========

      if (type === "points") {
        const users = await ctx.prisma.user.findMany({
          where: { isBanned: false, points: { gt: 0 } },
          orderBy: { points: "desc" },
          take: limit,
          select: { id: true, nickname: true, username: true, avatar: true, points: true, createdAt: true },
        });
        return {
          items: users.map((u) => ({
            userId: u.id,
            nickname: u.nickname || u.username,
            avatar: u.avatar,
            value: u.points,
            extra: { joinedAt: u.createdAt },
          })),
          type,
          metric,
        };
      }

      if (type === "commentator") {
        const [videoComments, gameComments, imageComments] = await Promise.all([
          ctx.prisma.comment.groupBy({
            by: ["userId"],
            where: { isDeleted: false, userId: { not: null } },
            _count: true,
          }),
          ctx.prisma.gameComment.groupBy({
            by: ["userId"],
            where: { isDeleted: false, userId: { not: null } },
            _count: true,
          }),
          ctx.prisma.imagePostComment.groupBy({
            by: ["userId"],
            where: { isDeleted: false, userId: { not: null } },
            _count: true,
          }),
        ]);

        const commentMap = new Map<string, { video: number; game: number; image: number }>();
        for (const c of videoComments) {
          if (!c.userId) continue;
          const prev = commentMap.get(c.userId) ?? { video: 0, game: 0, image: 0 };
          prev.video = c._count;
          commentMap.set(c.userId, prev);
        }
        for (const c of gameComments) {
          if (!c.userId) continue;
          const prev = commentMap.get(c.userId) ?? { video: 0, game: 0, image: 0 };
          prev.game = c._count;
          commentMap.set(c.userId, prev);
        }
        for (const c of imageComments) {
          if (!c.userId) continue;
          const prev = commentMap.get(c.userId) ?? { video: 0, game: 0, image: 0 };
          prev.image = c._count;
          commentMap.set(c.userId, prev);
        }

        const sorted = [...commentMap.entries()]
          .map(([userId, d]) => ({ userId, total: d.video + d.game + d.image, detail: d }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit);

        const userIds = sorted.map((s) => s.userId);
        const users = await ctx.prisma.user.findMany({
          where: { id: { in: userIds }, isBanned: false },
          select: { id: true, nickname: true, username: true, avatar: true },
        });
        const userMap = new Map(users.map((u) => [u.id, u]));

        return {
          items: sorted
            .filter((s) => userMap.has(s.userId))
            .map((s) => {
              const u = userMap.get(s.userId)!;
              return {
                userId: u.id,
                nickname: u.nickname || u.username,
                avatar: u.avatar,
                value: s.total,
                extra: { video: s.detail.video, game: s.detail.game, image: s.detail.image },
              };
            }),
          type,
          metric,
        };
      }

      if (type === "collector") {
        const [videoFavs, gameFavs, imageFavs] = await Promise.all([
          ctx.prisma.favorite.groupBy({ by: ["userId"], _count: true }),
          ctx.prisma.gameFavorite.groupBy({ by: ["userId"], _count: true }),
          ctx.prisma.imagePostFavorite.groupBy({ by: ["userId"], _count: true }),
        ]);

        const favMap = new Map<string, { video: number; game: number; image: number }>();
        for (const f of videoFavs) {
          const prev = favMap.get(f.userId) ?? { video: 0, game: 0, image: 0 };
          prev.video = f._count;
          favMap.set(f.userId, prev);
        }
        for (const f of gameFavs) {
          const prev = favMap.get(f.userId) ?? { video: 0, game: 0, image: 0 };
          prev.game = f._count;
          favMap.set(f.userId, prev);
        }
        for (const f of imageFavs) {
          const prev = favMap.get(f.userId) ?? { video: 0, game: 0, image: 0 };
          prev.image = f._count;
          favMap.set(f.userId, prev);
        }

        const sorted = [...favMap.entries()]
          .map(([userId, d]) => ({ userId, total: d.video + d.game + d.image, detail: d }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit);

        const userIds = sorted.map((s) => s.userId);
        const users = await ctx.prisma.user.findMany({
          where: { id: { in: userIds }, isBanned: false },
          select: { id: true, nickname: true, username: true, avatar: true },
        });
        const userMap = new Map(users.map((u) => [u.id, u]));

        return {
          items: sorted
            .filter((s) => userMap.has(s.userId))
            .map((s) => {
              const u = userMap.get(s.userId)!;
              return {
                userId: u.id,
                nickname: u.nickname || u.username,
                avatar: u.avatar,
                value: s.total,
                extra: { video: s.detail.video, game: s.detail.game, image: s.detail.image },
              };
            }),
          type,
          metric,
        };
      }

      if (type === "liker") {
        const [videoLikes, gameLikes, imageLikes] = await Promise.all([
          ctx.prisma.like.groupBy({ by: ["userId"], _count: true }),
          ctx.prisma.gameLike.groupBy({ by: ["userId"], _count: true }),
          ctx.prisma.imagePostLike.groupBy({ by: ["userId"], _count: true }),
        ]);

        const likeMap = new Map<string, { video: number; game: number; image: number }>();
        for (const l of videoLikes) {
          const prev = likeMap.get(l.userId) ?? { video: 0, game: 0, image: 0 };
          prev.video = l._count;
          likeMap.set(l.userId, prev);
        }
        for (const l of gameLikes) {
          const prev = likeMap.get(l.userId) ?? { video: 0, game: 0, image: 0 };
          prev.game = l._count;
          likeMap.set(l.userId, prev);
        }
        for (const l of imageLikes) {
          const prev = likeMap.get(l.userId) ?? { video: 0, game: 0, image: 0 };
          prev.image = l._count;
          likeMap.set(l.userId, prev);
        }

        const sorted = [...likeMap.entries()]
          .map(([userId, d]) => ({ userId, total: d.video + d.game + d.image, detail: d }))
          .sort((a, b) => b.total - a.total)
          .slice(0, limit);

        const userIds = sorted.map((s) => s.userId);
        const users = await ctx.prisma.user.findMany({
          where: { id: { in: userIds }, isBanned: false },
          select: { id: true, nickname: true, username: true, avatar: true },
        });
        const userMap = new Map(users.map((u) => [u.id, u]));

        return {
          items: sorted
            .filter((s) => userMap.has(s.userId))
            .map((s) => {
              const u = userMap.get(s.userId)!;
              return {
                userId: u.id,
                nickname: u.nickname || u.username,
                avatar: u.avatar,
                value: s.total,
                extra: { video: s.detail.video, game: s.detail.game, image: s.detail.image },
              };
            }),
          type,
          metric,
        };
      }

      if (type === "uploader") {
        const uploaders = await ctx.prisma.user.findMany({
          where: { isBanned: false },
          select: {
            id: true,
            nickname: true,
            username: true,
            avatar: true,
            _count: {
              select: {
                videos: { where: { status: "PUBLISHED" } },
                games: { where: { status: "PUBLISHED" } },
                imagePosts: { where: { status: "PUBLISHED" } },
              },
            },
          },
        });

        const ranked = uploaders
          .map((u) => ({
            userId: u.id,
            nickname: u.nickname || u.username,
            avatar: u.avatar,
            value: u._count.videos + u._count.games + u._count.imagePosts,
            detail: {
              videos: u._count.videos,
              games: u._count.games,
              images: u._count.imagePosts,
            },
          }))
          .filter((u) => u.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, limit);

        return { items: ranked, type, metric };
      }

      if (type === "video") {
        if (metric === "views") {
          const videos = await ctx.prisma.video.findMany({
            where: { status: "PUBLISHED" },
            orderBy: { views: "desc" },
            take: limit,
            select: {
              id: true,
              title: true,
              coverUrl: true,
              views: true,
              uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
              _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
            },
          });
          return {
            items: videos.map((v) => ({
              id: v.id,
              title: v.title,
              coverUrl: v.coverUrl,
              value: v.views,
              uploader: {
                id: v.uploader.id,
                name: v.uploader.nickname || v.uploader.username,
                avatar: v.uploader.avatar,
              },
              stats: {
                views: v.views,
                likes: v._count.likes,
                favorites: v._count.favorites,
                comments: v._count.comments,
              },
            })),
            type,
            metric,
          };
        }
        if (metric === "likes") {
          const videos = await ctx.prisma.video.findMany({
            where: { status: "PUBLISHED" },
            select: {
              id: true,
              title: true,
              coverUrl: true,
              views: true,
              uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
              _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
            },
          });
          const sorted = videos.sort((a, b) => b._count.likes - a._count.likes).slice(0, limit);
          return {
            items: sorted.map((v) => ({
              id: v.id,
              title: v.title,
              coverUrl: v.coverUrl,
              value: v._count.likes,
              uploader: {
                id: v.uploader.id,
                name: v.uploader.nickname || v.uploader.username,
                avatar: v.uploader.avatar,
              },
              stats: {
                views: v.views,
                likes: v._count.likes,
                favorites: v._count.favorites,
                comments: v._count.comments,
              },
            })),
            type,
            metric,
          };
        }
        if (metric === "favorites") {
          const videos = await ctx.prisma.video.findMany({
            where: { status: "PUBLISHED" },
            select: {
              id: true,
              title: true,
              coverUrl: true,
              views: true,
              uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
              _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
            },
          });
          const sorted = videos.sort((a, b) => b._count.favorites - a._count.favorites).slice(0, limit);
          return {
            items: sorted.map((v) => ({
              id: v.id,
              title: v.title,
              coverUrl: v.coverUrl,
              value: v._count.favorites,
              uploader: {
                id: v.uploader.id,
                name: v.uploader.nickname || v.uploader.username,
                avatar: v.uploader.avatar,
              },
              stats: {
                views: v.views,
                likes: v._count.likes,
                favorites: v._count.favorites,
                comments: v._count.comments,
              },
            })),
            type,
            metric,
          };
        }
        // comments
        const videos = await ctx.prisma.video.findMany({
          where: { status: "PUBLISHED" },
          select: {
            id: true,
            title: true,
            coverUrl: true,
            views: true,
            uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
            _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
          },
        });
        const sorted = videos.sort((a, b) => b._count.comments - a._count.comments).slice(0, limit);
        return {
          items: sorted.map((v) => ({
            id: v.id,
            title: v.title,
            coverUrl: v.coverUrl,
            value: v._count.comments,
            uploader: {
              id: v.uploader.id,
              name: v.uploader.nickname || v.uploader.username,
              avatar: v.uploader.avatar,
            },
            stats: {
              views: v.views,
              likes: v._count.likes,
              favorites: v._count.favorites,
              comments: v._count.comments,
            },
          })),
          type,
          metric,
        };
      }

      if (type === "game") {
        const baseSelect = {
          id: true,
          title: true,
          coverUrl: true,
          views: true,
          downloads: true,
          uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
          _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
        } as const;

        if (metric === "views") {
          const games = await ctx.prisma.game.findMany({
            where: { status: "PUBLISHED" },
            orderBy: { views: "desc" },
            take: limit,
            select: baseSelect,
          });
          return {
            items: games.map((g) => ({
              id: g.id,
              title: g.title,
              coverUrl: g.coverUrl,
              value: g.views,
              uploader: {
                id: g.uploader.id,
                name: g.uploader.nickname || g.uploader.username,
                avatar: g.uploader.avatar,
              },
              stats: {
                views: g.views,
                likes: g._count.likes,
                favorites: g._count.favorites,
                comments: g._count.comments,
                downloads: g.downloads,
              },
            })),
            type,
            metric,
          };
        }
        if (metric === "downloads") {
          const games = await ctx.prisma.game.findMany({
            where: { status: "PUBLISHED" },
            orderBy: { downloads: "desc" },
            take: limit,
            select: baseSelect,
          });
          return {
            items: games.map((g) => ({
              id: g.id,
              title: g.title,
              coverUrl: g.coverUrl,
              value: g.downloads,
              uploader: {
                id: g.uploader.id,
                name: g.uploader.nickname || g.uploader.username,
                avatar: g.uploader.avatar,
              },
              stats: {
                views: g.views,
                likes: g._count.likes,
                favorites: g._count.favorites,
                comments: g._count.comments,
                downloads: g.downloads,
              },
            })),
            type,
            metric,
          };
        }
        const games = await ctx.prisma.game.findMany({
          where: { status: "PUBLISHED" },
          select: baseSelect,
        });
        const key = metric === "likes" ? "likes" : metric === "favorites" ? "favorites" : "comments";
        const sorted = games.sort((a, b) => b._count[key] - a._count[key]).slice(0, limit);
        return {
          items: sorted.map((g) => ({
            id: g.id,
            title: g.title,
            coverUrl: g.coverUrl,
            value: g._count[key],
            uploader: {
              id: g.uploader.id,
              name: g.uploader.nickname || g.uploader.username,
              avatar: g.uploader.avatar,
            },
            stats: {
              views: g.views,
              likes: g._count.likes,
              favorites: g._count.favorites,
              comments: g._count.comments,
              downloads: g.downloads,
            },
          })),
          type,
          metric,
        };
      }

      // type === "image"
      const baseSelect = {
        id: true,
        title: true,
        views: true,
        images: true,
        uploader: { select: { id: true, nickname: true, username: true, avatar: true } },
        _count: { select: { likes: true, favorites: true, comments: { where: { isDeleted: false } } } },
      } as const;

      if (metric === "views") {
        const posts = await ctx.prisma.imagePost.findMany({
          where: { status: "PUBLISHED" },
          orderBy: { views: "desc" },
          take: limit,
          select: baseSelect,
        });
        return {
          items: posts.map((p) => ({
            id: p.id,
            title: p.title,
            coverUrl: (p.images as string[])?.[0] ?? null,
            value: p.views,
            uploader: {
              id: p.uploader.id,
              name: p.uploader.nickname || p.uploader.username,
              avatar: p.uploader.avatar,
            },
            stats: {
              views: p.views,
              likes: p._count.likes,
              favorites: p._count.favorites,
              comments: p._count.comments,
            },
          })),
          type,
          metric,
        };
      }
      const posts = await ctx.prisma.imagePost.findMany({
        where: { status: "PUBLISHED" },
        select: baseSelect,
      });
      const key = metric === "likes" ? "likes" : metric === "favorites" ? "favorites" : "comments";
      const sorted = posts.sort((a, b) => b._count[key] - a._count[key]).slice(0, limit);
      return {
        items: sorted.map((p) => ({
          id: p.id,
          title: p.title,
          coverUrl: (p.images as string[])?.[0] ?? null,
          value: p._count[key],
          uploader: { id: p.uploader.id, name: p.uploader.nickname || p.uploader.username, avatar: p.uploader.avatar },
          stats: { views: p.views, likes: p._count.likes, favorites: p._count.favorites, comments: p._count.comments },
        })),
        type,
        metric,
      };
    }),

  getGrowthStats: publicProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const since = new Date(input.from);
    const until = new Date(input.to);
    const dateRange = { gte: since, lte: until };

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
      ctx.prisma.user.count({ where: { createdAt: dateRange } }),
      ctx.prisma.video.count({ where: { status: "PUBLISHED", ...videoPublicationDateWhere(dateRange) } }),
      ctx.prisma.game.count({ where: { status: "PUBLISHED", ...gamePublicationDateWhere(dateRange) } }),
      ctx.prisma.imagePost.count({ where: { status: "PUBLISHED", ...imagePublicationDateWhere(dateRange) } }),
      ctx.prisma.tag.count({ where: { createdAt: dateRange } }),
      ctx.prisma.series.count({ where: { createdAt: dateRange } }),
      ctx.prisma.searchRecord.count({ where: { createdAt: dateRange } }),
      ctx.prisma.comment.count({ where: { createdAt: dateRange, isDeleted: false } }),
      ctx.prisma.gameComment.count({ where: { createdAt: dateRange, isDeleted: false } }),
      ctx.prisma.imagePostComment.count({ where: { createdAt: dateRange, isDeleted: false } }),
      ctx.prisma.watchHistory.count({ where: { createdAt: dateRange } }),
      ctx.prisma.gameViewHistory.count({ where: { createdAt: dateRange } }),
      ctx.prisma.imagePostViewHistory.count({ where: { createdAt: dateRange } }),
      ctx.prisma.like.count({ where: { createdAt: dateRange } }),
      ctx.prisma.gameLike.count({ where: { createdAt: dateRange } }),
      ctx.prisma.imagePostLike.count({ where: { createdAt: dateRange } }),
      ctx.prisma.favorite.count({ where: { createdAt: dateRange } }),
      ctx.prisma.gameFavorite.count({ where: { createdAt: dateRange } }),
      ctx.prisma.imagePostFavorite.count({ where: { createdAt: dateRange } }),
    ]);

    return {
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
  getGrowthTrend: publicProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const since = new Date(input.from);
    const until = new Date(input.to);
    const dateRange = { gte: since, lte: until };

    const [
      users,
      videos,
      images,
      games,
      videoViews,
      gameViews,
      imageViews,
      videoLikes,
      gameLikes,
      imageLikes,
      videoFavs,
      gameFavs,
      imageFavs,
      videoComments,
      gameComments,
      imageComments,
    ] = await Promise.all([
      ctx.prisma.user.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.video.findMany({
        where: { status: "PUBLISHED", ...videoPublicationDateWhere(dateRange) },
        select: { createdAt: true, publishedAt: true },
      }),
      ctx.prisma.imagePost.findMany({
        where: { status: "PUBLISHED", ...imagePublicationDateWhere(dateRange) },
        select: { createdAt: true, publishedAt: true },
      }),
      ctx.prisma.game.findMany({
        where: { status: "PUBLISHED", ...gamePublicationDateWhere(dateRange) },
        select: { createdAt: true, publishedAt: true },
      }),
      ctx.prisma.watchHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.gameViewHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.imagePostViewHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.like.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.gameLike.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.imagePostLike.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.favorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.gameFavorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.imagePostFavorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
      ctx.prisma.comment.findMany({ where: { createdAt: dateRange, isDeleted: false }, select: { createdAt: true } }),
      ctx.prisma.gameComment.findMany({
        where: { createdAt: dateRange, isDeleted: false },
        select: { createdAt: true },
      }),
      ctx.prisma.imagePostComment.findMany({
        where: { createdAt: dateRange, isDeleted: false },
        select: { createdAt: true },
      }),
    ]);

    type DayData = {
      users: number;
      videos: number;
      images: number;
      games: number;
      views: number;
      likes: number;
      favorites: number;
      comments: number;
    };
    const trend: Record<string, DayData> = {};

    const dayCount = computeDayCount(since, until);
    const toKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const empty = (): DayData => ({
      users: 0,
      videos: 0,
      images: 0,
      games: 0,
      views: 0,
      likes: 0,
      favorites: 0,
      comments: 0,
    });

    for (let i = 0; i < dayCount; i++) {
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
    const incPublished = (rows: { createdAt: Date; publishedAt: Date | null }[], field: keyof DayData) => {
      for (const r of rows) {
        const k = toKey(publicationDate(r));
        if (trend[k]) trend[k][field]++;
      }
    };

    inc(users, "users");
    incPublished(videos, "videos");
    incPublished(images, "images");
    incPublished(games, "games");
    inc([...videoViews, ...gameViews, ...imageViews], "views");
    inc([...videoLikes, ...gameLikes, ...imageLikes], "likes");
    inc([...videoFavs, ...gameFavs, ...imageFavs], "favorites");
    inc([...videoComments, ...gameComments, ...imageComments], "comments");

    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }),

  // 收入与新用户双轴趋势（每日 PAID 金额 + 笔数 + 新用户）
  getRevenueTrend: publicProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const since = new Date(input.from);
    const until = new Date(input.to);

    const [paidOrders, newUsers] = await Promise.all([
      ctx.prisma.paymentOrder.findMany({
        where: { status: "PAID", paidAt: { gte: since, lte: until } },
        select: { paidAt: true, amount: true },
      }),
      ctx.prisma.user.findMany({
        where: { createdAt: { gte: since, lte: until } },
        select: { createdAt: true },
      }),
    ]);

    type DayData = { revenue: number; orders: number; users: number };
    const trend: Record<string, DayData> = {};
    const dayCount = computeDayCount(since, until);
    const toKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    for (let i = 0; i < dayCount; i++) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      trend[toKey(date)] = { revenue: 0, orders: 0, users: 0 };
    }

    for (const o of paidOrders) {
      if (!o.paidAt) continue;
      const k = toKey(new Date(o.paidAt));
      if (trend[k]) {
        trend[k].revenue += o.amount;
        trend[k].orders += 1;
      }
    }
    for (const u of newUsers) {
      const k = toKey(new Date(u.createdAt));
      if (trend[k]) trend[k].users += 1;
    }

    return Object.entries(trend)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data, revenue: Math.round(data.revenue * 100) / 100 }));
  }),

  // 转化漏斗：注册用户 → 有内容 → 有互动 → 有付费
  getConversionFunnel: publicProcedure.input(dateRangeInput.optional()).query(async ({ ctx, input }) => {
    const where = input ? { createdAt: { gte: new Date(input.from), lte: new Date(input.to) } } : {};

    const [totalUsers, contentUsers, engagedUsers, paidUsers] = await Promise.all([
      ctx.prisma.user.count({ where }),
      ctx.prisma.user.count({
        where: {
          ...where,
          OR: [
            { videos: { some: { status: "PUBLISHED" } } },
            { games: { some: { status: "PUBLISHED" } } },
            { imagePosts: { some: { status: "PUBLISHED" } } },
          ],
        },
      }),
      ctx.prisma.user.count({
        where: {
          ...where,
          OR: [{ likes: { some: {} } }, { favorites: { some: {} } }, { comments: { some: {} } }],
        },
      }),
      ctx.prisma.user.count({
        where: { ...where, paymentOrders: { some: { status: "PAID" } } },
      }),
    ]);

    return [
      { stage: "注册用户", value: totalUsers, fill: "var(--color-stage-1)" },
      { stage: "有互动", value: engagedUsers, fill: "var(--color-stage-2)" },
      { stage: "有内容", value: contentUsers, fill: "var(--color-stage-3)" },
      { stage: "已付费", value: paidUsers, fill: "var(--color-stage-4)" },
    ];
  }),

  // 24×7 活跃度热力图（按小时 × 星期）
  getActivityHeatmap: publicProcedure.input(dateRangeInput).query(async ({ ctx, input }) => {
    const since = new Date(input.from);
    const until = new Date(input.to);
    const dateRange = { gte: since, lte: until };

    const [watch, gameView, imgView, like, gameLike, imgLike, fav, gameFav, imgFav, cmt, gameCmt, imgCmt] =
      await Promise.all([
        ctx.prisma.watchHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.gameViewHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.imagePostViewHistory.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.like.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.gameLike.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.imagePostLike.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.favorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.gameFavorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.imagePostFavorite.findMany({ where: { createdAt: dateRange }, select: { createdAt: true } }),
        ctx.prisma.comment.findMany({
          where: { createdAt: dateRange, isDeleted: false },
          select: { createdAt: true },
        }),
        ctx.prisma.gameComment.findMany({
          where: { createdAt: dateRange, isDeleted: false },
          select: { createdAt: true },
        }),
        ctx.prisma.imagePostComment.findMany({
          where: { createdAt: dateRange, isDeleted: false },
          select: { createdAt: true },
        }),
      ]);

    // 0..6 (周日=0) × 0..23
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const all = [
      ...watch,
      ...gameView,
      ...imgView,
      ...like,
      ...gameLike,
      ...imgLike,
      ...fav,
      ...gameFav,
      ...imgFav,
      ...cmt,
      ...gameCmt,
      ...imgCmt,
    ];

    for (const r of all) {
      const d = new Date(r.createdAt);
      grid[d.getDay()][d.getHours()] += 1;
    }

    // 扁平化为 { day, hour, value } 数组
    const cells: { day: number; hour: number; value: number }[] = [];
    let max = 0;
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const value = grid[day][hour];
        if (value > max) max = value;
        cells.push({ day, hour, value });
      }
    }
    return { cells, max, total: all.length };
  }),

  // 热门标签 Treemap（按内容关联数）
  getTopTags: publicProcedure
    .input(
      z.object({
        limit: z.number().min(5).max(80).default(40),
        kind: z.enum(["all", "video", "game", "image"]).default("all"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tags = await ctx.prisma.tag.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          videoCount: true,
          gameCount: true,
          imagePostCount: true,
          category: { select: { name: true, color: true } },
        },
      });

      const items = tags
        .map((t) => {
          const v = t.videoCount;
          const g = t.gameCount;
          const i = t.imagePostCount;
          const value = input.kind === "all" ? v + g + i : input.kind === "video" ? v : input.kind === "game" ? g : i;
          return {
            id: t.id,
            name: t.name,
            slug: t.slug,
            color: t.category?.color ?? null,
            category: t.category?.name ?? null,
            value,
            video: v,
            game: g,
            image: i,
          };
        })
        .filter((t) => t.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, input.limit);

      return items;
    }),

  // 分区健康度（互动率：点赞/浏览、收藏/浏览、评论/浏览、踩比）
  getZoneHealth: publicProcedure.query(async ({ ctx }) => {
    const [v, g, i, vViews, gViews, iViews] = await Promise.all([
      ctx.prisma.video.aggregate({
        where: { status: "PUBLISHED" },
        _sum: { views: true },
        _count: true,
      }),
      ctx.prisma.game.aggregate({ where: { status: "PUBLISHED" }, _sum: { views: true }, _count: true }),
      ctx.prisma.imagePost.aggregate({
        where: { status: "PUBLISHED" },
        _sum: { views: true },
        _count: true,
      }),
      Promise.all([
        ctx.prisma.like.count(),
        ctx.prisma.dislike.count(),
        ctx.prisma.favorite.count(),
        ctx.prisma.comment.count({ where: { isDeleted: false } }),
      ]),
      Promise.all([
        ctx.prisma.gameLike.count(),
        ctx.prisma.gameDislike.count(),
        ctx.prisma.gameFavorite.count(),
        ctx.prisma.gameComment.count({ where: { isDeleted: false } }),
      ]),
      Promise.all([
        ctx.prisma.imagePostLike.count(),
        ctx.prisma.imagePostDislike.count(),
        ctx.prisma.imagePostFavorite.count(),
        ctx.prisma.imagePostComment.count({ where: { isDeleted: false } }),
      ]),
    ]);

    const [vLikes, vDislikes, vFavs, vCmts] = vViews;
    const [gLikes, gDislikes, gFavs, gCmts] = gViews;
    const [iLikes, iDislikes, iFavs, iCmts] = iViews;

    const ratio = (num: number, denom: number) => (denom > 0 ? Math.round((num / denom) * 10000) / 100 : 0);
    const score = (likes: number, favs: number, cmts: number, dislikes: number, views: number) => {
      // 综合健康分：互动密度 - 负反馈，归一到 0-100
      const engagement = ratio(likes + favs * 2 + cmts * 3, views);
      const negative = ratio(dislikes, likes + dislikes || 1);
      return Math.max(0, Math.min(100, Math.round(engagement - negative * 0.5)));
    };

    return [
      {
        zone: "视频",
        likeRate: ratio(vLikes, v._sum.views || 0),
        favRate: ratio(vFavs, v._sum.views || 0),
        commentRate: ratio(vCmts, v._sum.views || 0),
        dislikeRate: ratio(vDislikes, vLikes + vDislikes || 1),
        score: score(vLikes, vFavs, vCmts, vDislikes, v._sum.views || 0),
      },
      {
        zone: "图片",
        likeRate: ratio(iLikes, i._sum.views || 0),
        favRate: ratio(iFavs, i._sum.views || 0),
        commentRate: ratio(iCmts, i._sum.views || 0),
        dislikeRate: ratio(iDislikes, iLikes + iDislikes || 1),
        score: score(iLikes, iFavs, iCmts, iDislikes, i._sum.views || 0),
      },
      {
        zone: "游戏",
        likeRate: ratio(gLikes, g._sum.views || 0),
        favRate: ratio(gFavs, g._sum.views || 0),
        commentRate: ratio(gCmts, g._sum.views || 0),
        dislikeRate: ratio(gDislikes, gLikes + gDislikes || 1),
        score: score(gLikes, gFavs, gCmts, gDislikes, g._sum.views || 0),
      },
    ];
  }),
});
