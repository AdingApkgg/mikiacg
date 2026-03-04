import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { getIpLocation } from "@/lib/ip-location";
import { parseDeviceInfo, type DeviceInfo } from "@/lib/device-info";
import { awardPoints } from "@/lib/points";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const urlRegex = /^https?:\/\/.+/;

const SortType = z.enum(["newest", "oldest", "popular"]);

export const imagePostCommentRouter = router({
  list: publicProcedure
    .input(
      z.object({
        imagePostId: z.string(),
        sort: SortType.default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { imagePostId, sort, cursor, limit } = input;

      const orderBy = (() => {
        switch (sort) {
          case "oldest":
            return { createdAt: "asc" as const };
          case "popular":
            return { likes: "desc" as const };
          default:
            return { createdAt: "desc" as const };
        }
      })();

      const comments = await ctx.prisma.imagePostComment.findMany({
        where: {
          imagePostId,
          parentId: null,
          isDeleted: false,
          isHidden: false,
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
              role: true,
            },
          },
          replyToUser: {
            select: { id: true, username: true, nickname: true },
          },
          _count: { select: { replies: true } },
          reactions: ctx.session?.user
            ? { where: { userId: ctx.session.user.id }, select: { isLike: true } }
            : false,
        },
      });

      let nextCursor: string | undefined;
      if (comments.length > limit) {
        const nextItem = comments.pop();
        nextCursor = nextItem?.id;
      }

      return {
        comments: comments.map((c) => ({
          ...c,
          userReaction: c.reactions?.[0]?.isLike ?? null,
          reactions: undefined,
        })),
        nextCursor,
      };
    }),

  getReplies: publicProcedure
    .input(
      z.object({
        commentId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { commentId, cursor, limit } = input;

      const replies = await ctx.prisma.imagePostComment.findMany({
        where: { parentId: commentId, isDeleted: false, isHidden: false },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: { id: true, username: true, nickname: true, avatar: true, role: true },
          },
          replyToUser: {
            select: { id: true, username: true, nickname: true },
          },
          reactions: ctx.session?.user
            ? { where: { userId: ctx.session.user.id }, select: { isLike: true } }
            : false,
        },
      });

      let nextCursor: string | undefined;
      if (replies.length > limit) {
        const nextItem = replies.pop();
        nextCursor = nextItem?.id;
      }

      return {
        replies: replies.map((r) => ({
          ...r,
          userReaction: r.reactions?.[0]?.isLike ?? null,
          reactions: undefined,
        })),
        nextCursor,
      };
    }),

  getCount: publicProcedure
    .input(z.object({ imagePostId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.imagePostComment.count({
        where: { imagePostId: input.imagePostId, isDeleted: false, isHidden: false },
      });
    }),

  create: publicProcedure
    .input(
      z.object({
        imagePostId: z.string(),
        content: z.string().min(1).max(2000),
        parentId: z.string().optional(),
        replyToUserId: z.string().optional(),
        guestName: z.string().min(1).max(50).optional(),
        guestEmail: z.string().refine((v) => !v || emailRegex.test(v), { message: "邮箱格式不正确" }).optional(),
        guestWebsite: z.string().refine((v) => !v || urlRegex.test(v), { message: "网址格式不正确" }).optional(),
        deviceInfo: z
          .object({
            deviceType: z.string().nullable().optional(),
            os: z.string().nullable().optional(),
            osVersion: z.string().nullable().optional(),
            browser: z.string().nullable().optional(),
            browserVersion: z.string().nullable().optional(),
            brand: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
            platform: z.string().nullable().optional(),
            language: z.string().nullable().optional(),
            timezone: z.string().nullable().optional(),
            screen: z.string().nullable().optional(),
            pixelRatio: z.number().nullable().optional(),
            userAgent: z.string().nullable().optional(),
            fingerprint: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { imagePostId, content, parentId, replyToUserId, guestName, guestEmail, guestWebsite, deviceInfo } = input;
      const userId = ctx.session?.user?.id;

      const siteConfig = await ctx.prisma.siteConfig.findUnique({
        where: { id: "default" },
        select: { allowComment: true, requireLoginToComment: true },
      });

      if (siteConfig && !siteConfig.allowComment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "评论功能已关闭" });
      }

      if (siteConfig?.requireLoginToComment && !userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "请登录后再发表评论" });
      }

      if (!userId && !guestName) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请填写昵称" });
      }

      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(ctx.ipv4Address),
        getIpLocation(ctx.ipv6Address),
      ]);

      let normalizedDeviceInfo: DeviceInfo;
      if (deviceInfo && deviceInfo.os && deviceInfo.osVersion) {
        normalizedDeviceInfo = {
          deviceType: deviceInfo.deviceType || "desktop",
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          browser: deviceInfo.browser || null,
          browserVersion: deviceInfo.browserVersion || null,
          brand: deviceInfo.brand || null,
          model: deviceInfo.model || null,
          platform: deviceInfo.platform || null,
          language: deviceInfo.language || null,
          timezone: deviceInfo.timezone || null,
          screen: deviceInfo.screen || null,
          pixelRatio: deviceInfo.pixelRatio || null,
          userAgent: deviceInfo.userAgent || ctx.userAgent || null,
          fingerprint: deviceInfo.fingerprint || "unknown",
        };
      } else {
        normalizedDeviceInfo = parseDeviceInfo(ctx.userAgent, deviceInfo);
      }

      const post = await ctx.prisma.imagePost.findUnique({
        where: { id: imagePostId },
        select: { id: true, status: true },
      });

      if (!post || post.status !== "PUBLISHED") {
        throw new TRPCError({ code: "NOT_FOUND", message: "图片帖不存在" });
      }

      if (parentId) {
        const parentComment = await ctx.prisma.imagePostComment.findUnique({
          where: { id: parentId },
          select: { id: true, imagePostId: true, isDeleted: true },
        });
        if (!parentComment || parentComment.isDeleted || parentComment.imagePostId !== imagePostId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
        }
      }

      const comment = await ctx.prisma.imagePostComment.create({
        data: {
          content,
          userId: userId || null,
          imagePostId,
          parentId,
          replyToUserId,
          guestName: userId ? null : guestName,
          guestEmail: userId ? null : guestEmail,
          guestWebsite: userId ? null : guestWebsite,
          ipv4Address: ctx.ipv4Address,
          ipv4Location,
          ipv6Address: ctx.ipv6Address,
          ipv6Location,
          deviceInfo: normalizedDeviceInfo as unknown as Prisma.InputJsonValue,
          userAgent: ctx.userAgent,
        },
        include: {
          user: {
            select: { id: true, username: true, nickname: true, avatar: true, role: true },
          },
          replyToUser: {
            select: { id: true, username: true, nickname: true },
          },
          _count: { select: { replies: true } },
        },
      });

      if (userId) {
        const lastIpLocation = ipv4Location || ipv6Location;
        await ctx.prisma.user.update({
          where: { id: userId },
          data: { lastIpLocation: lastIpLocation || undefined },
        });
        awardPoints(userId, "COMMENT_IMAGE", undefined, comment.id);
      }

      return { ...comment, userReaction: null };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.imagePostComment.findUnique({
        where: { id: input.id },
        select: { userId: true, isDeleted: true },
      });
      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      }
      if (comment.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此评论" });
      }
      return ctx.prisma.imagePostComment.update({
        where: { id: input.id },
        data: { content: input.content, isEdited: true },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.prisma.imagePostComment.findUnique({
        where: { id: input.id },
        select: { userId: true, isDeleted: true },
      });
      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      }
      const isOwner = comment.userId === ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "ADMIN" || ctx.session.user.role === "OWNER";
      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权删除此评论" });
      }
      await ctx.prisma.imagePostComment.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });
      return { success: true };
    }),

  react: protectedProcedure
    .input(z.object({ commentId: z.string(), isLike: z.boolean().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { commentId, isLike } = input;
      const userId = ctx.session.user.id;

      const comment = await ctx.prisma.imagePostComment.findUnique({
        where: { id: commentId },
        select: { id: true, likes: true, dislikes: true, isDeleted: true },
      });
      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      }

      const existing = await ctx.prisma.imagePostCommentReaction.findUnique({
        where: { userId_commentId: { userId, commentId } },
      });

      let likeDelta = 0;
      let dislikeDelta = 0;

      if (isLike === null) {
        if (existing) {
          await ctx.prisma.imagePostCommentReaction.delete({ where: { id: existing.id } });
          likeDelta = existing.isLike ? -1 : 0;
          dislikeDelta = existing.isLike ? 0 : -1;
        }
      } else if (existing) {
        if (existing.isLike !== isLike) {
          await ctx.prisma.imagePostCommentReaction.update({ where: { id: existing.id }, data: { isLike } });
          likeDelta = isLike ? 1 : -1;
          dislikeDelta = isLike ? -1 : 1;
        }
      } else {
        await ctx.prisma.imagePostCommentReaction.create({ data: { userId, commentId, isLike } });
        likeDelta = isLike ? 1 : 0;
        dislikeDelta = isLike ? 0 : 1;
      }

      if (likeDelta !== 0 || dislikeDelta !== 0) {
        await ctx.prisma.imagePostComment.update({
          where: { id: commentId },
          data: { likes: { increment: likeDelta }, dislikes: { increment: dislikeDelta } },
        });
      }

      return { likes: comment.likes + likeDelta, dislikes: comment.dislikes + dislikeDelta, userReaction: isLike };
    }),

  pin: protectedProcedure
    .input(z.object({ commentId: z.string(), isPinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { commentId, isPinned } = input;
      const userId = ctx.session.user.id;
      const userRole = ctx.session.user.role;

      const comment = await ctx.prisma.imagePostComment.findUnique({
        where: { id: commentId },
        include: { imagePost: { select: { uploaderId: true } } },
      });
      if (!comment || comment.isDeleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      }

      const isUploader = comment.imagePost.uploaderId === userId;
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER";
      if (!isUploader && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权置顶评论" });
      }

      if (isPinned) {
        await ctx.prisma.imagePostComment.updateMany({
          where: { imagePostId: comment.imagePostId, isPinned: true },
          data: { isPinned: false },
        });
      }

      await ctx.prisma.imagePostComment.update({
        where: { id: commentId },
        data: { isPinned },
      });

      return { success: true };
    }),
});
