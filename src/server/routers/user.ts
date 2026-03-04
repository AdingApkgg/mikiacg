import { z } from "zod";
import { router, publicProcedure, protectedProcedure, ownerProcedure, adminProcedure } from "../trpc";
import { hash, compare } from "@/lib/bcrypt-wasm";
import { TRPCError } from "@trpc/server";

export const userRouter = router({
  // 注册
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(3).max(20),
        password: z.string().min(6),
        nickname: z.string().optional(),
        referralCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.prisma.user.findFirst({
        where: {
          OR: [{ email: input.email }, { username: input.username }],
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "邮箱或用户名已存在",
        });
      }

      const hashedPassword = await hash(input.password, 10);

      // Resolve referral link if provided (must be active)
      let referralLink: { id: string; userId: string } | null = null;
      if (input.referralCode) {
        const link = await ctx.prisma.referralLink.findUnique({
          where: { code: input.referralCode },
          select: { id: true, userId: true, isActive: true },
        });
        if (link?.isActive) {
          referralLink = link;
        }
      }

      const result = await ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            username: input.username.toLowerCase(),
            displayUsername: input.username,
            password: hashedPassword,
            nickname: input.nickname || input.username,
            ...(referralLink ? { referredById: referralLink.userId } : {}),
          },
        });

        await tx.account.create({
          data: {
            userId: user.id,
            type: "credential",
            provider: "credential",
            providerAccountId: user.id,
            password: hashedPassword,
          },
        });

        // Process referral reward
        if (referralLink) {
          const siteConfig = await tx.siteConfig.findUnique({
            where: { id: "default" },
            select: { referralEnabled: true, referralPointsPerUser: true },
          });

          if (siteConfig?.referralEnabled) {
            const pointsReward = siteConfig.referralPointsPerUser || 100;

            await tx.referralRecord.create({
              data: {
                referrerId: referralLink.userId,
                referredUserId: user.id,
                referralLinkId: referralLink.id,
                pointsAwarded: pointsReward,
              },
            });

            const referrer = await tx.user.update({
              where: { id: referralLink.userId },
              data: { points: { increment: pointsReward } },
              select: { points: true },
            });

            await tx.pointsTransaction.create({
              data: {
                userId: referralLink.userId,
                amount: pointsReward,
                balance: referrer.points,
                type: "REFERRAL_REWARD",
                description: `推广用户 ${input.username} 注册`,
                relatedId: user.id,
              },
            });

            await tx.referralLink.update({
              where: { id: referralLink.id },
              data: { registers: { increment: 1 } },
            });
          }
        }

        return user;
      });

      return { id: result.id, email: result.email, username: result.username };
    }),

  // 获取用户公开资料
  getProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          bio: true,
          pronouns: true,
          website: true,
          location: true,
          socialLinks: true,
          lastIpLocation: true,
          createdAt: true,
          _count: {
            select: {
              videos: { where: { status: "PUBLISHED" } },
              likes: true,
              favorites: true,
              games: { where: { status: "PUBLISHED" } },
              gameFavorites: true,
              gameLikes: true,
              imagePosts: { where: { status: "PUBLISHED" } },
              imagePostLikes: true,
              imagePostFavorites: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      return user;
    }),

  getVideos: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = { uploaderId: input.userId, status: "PUBLISHED" as const };

      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            _count: { select: { likes: true, dislikes: true, confused: true, comments: true, favorites: true } },
          },
        }),
        ctx.prisma.video.count({ where }),
      ]);

      return {
        videos,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      };
    }),

  getGames: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        page: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, page } = input;
      const where = { uploaderId: input.userId, status: "PUBLISHED" as const };

      const [games, totalCount] = await Promise.all([
        ctx.prisma.game.findMany({
          where,
          skip: (page - 1) * limit,
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

  // 获取当前用户信息
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
        bio: true,
        pronouns: true,
        website: true,
        location: true,
        socialLinks: true,
        role: true,
        points: true,
        lastIpLocation: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return user;
  }),

  // 更新个人信息
  updateProfile: protectedProcedure
    .input(
      z.object({
        nickname: z.string().min(1).max(50).optional(),
        bio: z.string().max(500).optional(),
        pronouns: z.string().max(30).optional(),
        website: z.string().url().or(z.literal("")).optional(),
        location: z.string().max(100).optional(),
        socialLinks: z.object({
          twitter: z.string().optional(),
          github: z.string().optional(),
          discord: z.string().optional(),
          youtube: z.string().optional(),
          pixiv: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { socialLinks, ...rest } = input;
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...rest,
          ...(socialLinks !== undefined && { socialLinks }),
        },
      });

      return { success: true, user };
    }),

  // 获取登录会话列表
  getLoginSessions: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.loginSession.findMany({
        where: { 
          userId: ctx.session.user.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { lastActiveAt: "desc" },
        take: input?.limit || 20,
        select: {
          id: true,
          jti: true,
          deviceType: true,
          os: true,
          osVersion: true,
          browser: true,
          browserVersion: true,
          brand: true,
          model: true,
          ipv4Address: true,
          ipv4Location: true,
          ipv6Address: true,
          ipv6Location: true,
          createdAt: true,
          lastActiveAt: true,
        },
      });

      const currentJti = ctx.session.jti;

      return {
        sessions,
        currentJti,
      };
    }),

  // 撤销会话（登出其他设备）— 同时删除 Better Auth Session 使 cookie 立即失效
  revokeLoginSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const loginSession = await ctx.prisma.loginSession.findUnique({
        where: { id: input.id },
        select: { userId: true, jti: true },
      });

      if (!loginSession || loginSession.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权限撤销该会话" });
      }

      if (loginSession.jti === ctx.session.jti) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能撤销当前会话，请使用登出功能" });
      }

      await ctx.prisma.$transaction([
        ctx.prisma.loginSession.update({
          where: { id: input.id },
          data: { isRevoked: true, revokedAt: new Date() },
        }),
        // 删除 Better Auth Session，使对应 cookie 立即失效
        ctx.prisma.session.deleteMany({
          where: { sessionToken: loginSession.jti },
        }),
      ]);
      
      return { success: true };
    }),

  // 撤销所有其他会话
  revokeAllOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
    // 先获取要撤销的 jti 列表
    const toRevoke = await ctx.prisma.loginSession.findMany({
      where: {
        userId: ctx.session.user.id,
        isRevoked: false,
        NOT: { jti: ctx.session.jti },
      },
      select: { jti: true },
    });

    const jtis = toRevoke.map(s => s.jti);

    const [result] = await ctx.prisma.$transaction([
      ctx.prisma.loginSession.updateMany({
        where: {
          userId: ctx.session.user.id,
          isRevoked: false,
          NOT: { jti: ctx.session.jti },
        },
        data: { isRevoked: true, revokedAt: new Date() },
      }),
      // 删除所有对应的 Better Auth Session
      ...(jtis.length > 0
        ? [ctx.prisma.session.deleteMany({
            where: { sessionToken: { in: jtis } },
          })]
        : []),
    ]);

    return { count: result.count };
  }),

  // 更新账户信息（用户名、邮箱）
  updateAccount: protectedProcedure
    .input(
      z.object({
        username: z.string().min(3, "用户名至少3个字符").max(20, "用户名最多20个字符").regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线").optional(),
        email: z.string().email("请输入有效的邮箱地址").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: { username?: string; email?: string } = {};

      // 检查用户名是否已存在
      if (input.username) {
        const existingUsername = await ctx.prisma.user.findFirst({
          where: {
            username: input.username,
            NOT: { id: ctx.session.user.id },
          },
        });
        if (existingUsername) {
          throw new TRPCError({ code: "CONFLICT", message: "用户名已被使用" });
        }
        updates.username = input.username;
      }

      // 检查邮箱是否已存在
      if (input.email) {
        const existingEmail = await ctx.prisma.user.findFirst({
          where: {
            email: input.email,
            NOT: { id: ctx.session.user.id },
          },
        });
        if (existingEmail) {
          throw new TRPCError({ code: "CONFLICT", message: "邮箱已被使用" });
        }
        updates.email = input.email;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: updates,
      });

      return { success: true };
    }),

  // 修改密码
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.password) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isValid = await compare(input.currentPassword, user.password);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前密码错误",
        });
      }

      const hashedPassword = await hash(input.newPassword, 10);
      await ctx.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      // 同步更新 Better Auth credential Account
      await ctx.prisma.account.updateMany({
        where: { userId, provider: "credential" },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // 重置密码（忘记密码）
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        newPassword: z.string().min(6, "密码至少6个字符"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "该邮箱未注册",
        });
      }

      const hashedPassword = await hash(input.newPassword, 10);
      await ctx.prisma.user.update({
        where: { email: input.email },
        data: { password: hashedPassword },
      });

      // 同步更新 Better Auth credential Account
      await ctx.prisma.account.updateMany({
        where: { userId: user.id, provider: "credential" },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // 注销账号（删除账号，视频转移给站长）
  deleteAccount: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1, "请输入密码确认"),
        confirmText: z.literal("DELETE", { message: "请输入 DELETE 确认" }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 获取当前用户
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true, role: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 站长不能注销自己的账号
      if (user.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "站长账号不能注销，请先转让站长权限",
        });
      }

      // 验证密码
      if (user.password) {
        const isValid = await compare(input.password, user.password);
        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "密码错误",
          });
        }
      }

      // 获取站长账号
      const owner = await ctx.prisma.user.findFirst({
        where: { role: "OWNER" },
        select: { id: true },
      });

      if (!owner) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "系统错误：未找到站长账号",
        });
      }

      // 使用事务处理
      await ctx.prisma.$transaction(async (tx) => {
        // 1. 将用户的视频转移给站长
        await tx.video.updateMany({
          where: { uploaderId: userId },
          data: { uploaderId: owner.id },
        });

        // 2. 将用户的播放列表转移给站长
        await tx.playlist.updateMany({
          where: { userId: userId },
          data: { userId: owner.id },
        });

        // 3. 删除用户（其他关联数据会通过 onDelete: Cascade 自动删除）
        // 包括：收藏、观看历史、点赞、踩、困惑、账号、会话
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return { success: true };
    }),

  // 获取已上传的头像列表（用于选择）
  getAvatarGallery: protectedProcedure.query(async ({ ctx }) => {
    const avatars = new Set<string>();

    // 1. 从数据库获取已设置的头像
    const users = await ctx.prisma.user.findMany({
      where: {
        avatar: { not: null },
      },
      select: {
        avatar: true,
      },
      distinct: ["avatar"],
      take: 50,
    });

    users.forEach((u) => {
      if (u.avatar) avatars.add(u.avatar);
    });

    // 2. 从文件系统读取已上传的头像
    const fs = await import("fs/promises");
    const path = await import("path");
    const { uploadDir } = await (await import("@/lib/server-config")).getServerConfig();
    const avatarDir = path.join(uploadDir, "avatar");

    try {
      const files = await fs.readdir(avatarDir);
      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
      
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          avatars.add(`/uploads/avatar/${file}`);
        }
      }
    } catch {
      // 目录不存在或无法读取，忽略
    }

    return Array.from(avatars).slice(0, 50);
  }),

  // 更新头像
  updateAvatar: protectedProcedure
    .input(
      z.object({
        // 支持完整 URL 或相对路径 (如 /uploads/avatar/xxx.jpg)
        avatar: z.string().refine(
          (val) => {
            if (!val) return true; // 允许空字符串
            if (val.startsWith("/")) return true; // 相对路径
            try {
              new URL(val);
              return true;
            } catch {
              return false;
            }
          },
          { message: "请输入有效的图片URL或路径" }
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { avatar: input.avatar || null },
      });

      return { success: true, avatar: user.avatar };
    }),

  // 获取所有用户列表（管理员）
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.search
          ? {
              OR: [
                { username: { contains: input.search, mode: "insensitive" } },
                { nickname: { contains: input.search, mode: "insensitive" } },
                { email: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          createdAt: true,
          _count: { select: { videos: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return { users, nextCursor };
    }),

  // 设置用户角色（仅站长）
  setUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]), // 站长只能设置为 USER 或 ADMIN
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 不能修改自己的角色
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      // 不能修改其他站长的角色
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
        data: { role: input.role },
        select: { id: true, username: true, role: true },
      });

      return { success: true, user };
    }),

  // 转让站长权限（仅站长）
  transferOwnership: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能转让给自己" });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 事务：将目标用户设为站长，将自己降为管理员
      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: input.userId },
          data: { role: "OWNER" },
        }),
        ctx.prisma.user.update({
          where: { id: ctx.session.user.id },
          data: { role: "ADMIN" },
        }),
      ]);

      return { success: true };
    }),
});
