import { router, adminProcedure, requireScope } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { submitGameToIndexNow, submitGamesToIndexNow } from "@/lib/indexnow";
import { safeSync } from "@/lib/meilisearch";
import { syncGame, deleteGame as deleteGameSearchIndex } from "@/lib/search-sync";
import { resolveTagNames } from "@/server/publish-utils";

export const adminGamesRouter = router({
  // ==================== 游戏管理 ====================

  /** 获取游戏用于编辑（管理员可编辑任意游戏） */
  getGameForEdit: adminProcedure
    .use(requireScope("video:moderate"))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.prisma.game.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          versions: {
            orderBy: { sortOrder: "asc" },
          },
          customTabs: {
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: "游戏不存在" });
      }

      return game;
    }),

  /** 游戏统计 */
  getGameStats: adminProcedure.use(requireScope("video:moderate")).query(async ({ ctx }) => {
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
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
        gameType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
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
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        gameId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.game.update({
        where: { id: input.gameId },
        data: { status: input.status },
      });

      // 审核通过时通知搜索引擎索引，并首次设置 publishedAt（已设置则保留）
      if (input.status === "PUBLISHED") {
        await ctx.prisma.game.updateMany({
          where: { id: input.gameId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        submitGameToIndexNow(input.gameId).catch(() => {});
      }

      void safeSync(syncGame(input.gameId));

      return { success: true };
    }),

  /** 删除游戏 */
  deleteGame: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.game.delete({ where: { id: input.gameId } });
      void safeSync(deleteGameSearchIndex(input.gameId));
      return { success: true };
    }),

  /** 创建游戏（管理员） */
  createGame: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        coverUrl: z.string().optional(),
        gameType: z.string().optional(),
        isFree: z.boolean().default(true),
        isNsfw: z.boolean().default(false),
        version: z.string().optional(),
        extraInfo: z.any().optional(),
        tagNames: z.array(z.string()).default([]),
        status: z.enum(["PENDING", "PUBLISHED"]).default("PUBLISHED"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

      // 处理标签（resolveTagNames 内部会剥离 (N) 后缀 + 通过 TagAlias 合并历史重名）
      const tagConnections: { tagId: string }[] = [];
      if (input.tagNames.length > 0) {
        const nameToId = await resolveTagNames(ctx.prisma, input.tagNames);
        for (const id of nameToId.values()) tagConnections.push({ tagId: id });
      }

      const game = await ctx.prisma.game.create({
        data: {
          id: gameId,
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl,
          gameType: input.gameType,
          isFree: input.isFree,
          isNsfw: input.isNsfw,
          version: input.version,
          extraInfo: input.extraInfo || undefined,
          status: input.status,
          publishedAt: input.status === "PUBLISHED" ? new Date() : null,
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

      void safeSync(syncGame(game.id));

      return game;
    }),

  /** 更新游戏 */
  updateGame: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        gameId: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        coverUrl: z.string().optional(),
        gameType: z.string().optional(),
        isFree: z.boolean().optional(),
        isNsfw: z.boolean().optional(),
        version: z.string().optional(),
        extraInfo: z.any().optional(),
        tagNames: z.array(z.string()).optional(),
        versions: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string().min(1).max(100),
              description: z.string().max(10000).optional(),
            }),
          )
          .optional(),
        customTabs: z
          .array(
            z.object({
              id: z.string().optional(),
              title: z.string().min(1).max(100),
              icon: z.string().max(50).optional(),
              content: z.string().max(50000),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { gameId, tagNames, versions, customTabs, ...updateData } = input;

      // 更新基本信息
      await ctx.prisma.game.update({
        where: { id: gameId },
        data: updateData,
      });

      // 如果提供了标签，更新标签关联（resolveTagNames 内部会规范化并合并历史重名）
      if (tagNames) {
        await ctx.prisma.tagOnGame.deleteMany({ where: { gameId } });

        if (tagNames.length > 0) {
          const nameToId = await resolveTagNames(ctx.prisma, tagNames);
          const seen = new Set<string>();
          for (const id of nameToId.values()) {
            if (seen.has(id)) continue;
            seen.add(id);
            await ctx.prisma.tagOnGame.create({ data: { gameId, tagId: id } });
          }
        }
      }

      // 更新版本列表：全量替换
      if (versions !== undefined) {
        await ctx.prisma.gameVersion.deleteMany({ where: { gameId } });
        if (versions.length > 0) {
          await ctx.prisma.gameVersion.createMany({
            data: versions.map((v, i) => ({
              gameId,
              label: v.label,
              description: v.description || null,
              sortOrder: i,
            })),
          });
        }
      }

      // 更新自定义 Tab：全量替换
      if (customTabs !== undefined) {
        await ctx.prisma.gameCustomTab.deleteMany({ where: { gameId } });
        if (customTabs.length > 0) {
          await ctx.prisma.gameCustomTab.createMany({
            data: customTabs.map((t, i) => ({
              gameId,
              title: t.title,
              icon: t.icon || null,
              content: t.content,
              sortOrder: i,
            })),
          });
        }
      }

      // 游戏更新后通知搜索引擎重新索引
      submitGameToIndexNow(gameId).catch(() => {});

      void safeSync(syncGame(gameId));

      return { success: true };
    }),

  /** 获取所有游戏 ID（用于全选） */
  getAllGameIds: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
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
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(1000),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.game.updateMany({
        where: { id: { in: input.gameIds } },
        data: { status: input.status },
      });

      // 批量审核通过时通知搜索引擎索引，并首次设置 publishedAt
      if (input.status === "PUBLISHED") {
        await ctx.prisma.game.updateMany({
          where: { id: { in: input.gameIds }, publishedAt: null },
          data: { publishedAt: new Date() },
        });
        submitGamesToIndexNow(input.gameIds).catch(() => {});
      }

      for (const gid of input.gameIds) {
        void safeSync(syncGame(gid));
      }

      return { success: true, count: result.count };
    }),

  /** 批量删除游戏 */
  batchDeleteGames: adminProcedure
    .use(requireScope("video:manage"))
    .input(z.object({ gameIds: z.array(z.string()).min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.game.deleteMany({
        where: { id: { in: input.gameIds } },
      });

      for (const gid of input.gameIds) {
        void safeSync(deleteGameSearchIndex(gid));
      }

      return { success: true, count: result.count };
    }),

  // ========== 游戏正则批量编辑 ==========

  // 直接列字段
  // extraInfo JSON 子字段用 "extraInfo.xxx" 格式表示

  // 正则批量编辑 - 预览
  batchGameRegexPreview: adminProcedure
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title",
          "description",
          "coverUrl",
          "gameType",
          "version",
          "extraInfo.downloads.url",
          "extraInfo.downloads.name",
          "extraInfo.downloads.password",
          "extraInfo.screenshots",
          "extraInfo.videos",
          "extraInfo.originalName",
          "extraInfo.authorUrl",
          "extraInfo.characterIntro",
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

      const games = await ctx.prisma.game.findMany({
        where: { id: { in: input.gameIds } },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          gameType: true,
          version: true,
          extraInfo: true,
        },
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
              previews.push({
                id: game.id,
                title: game.title,
                before: beforeLines.join("\n"),
                after: afterLines.join("\n"),
                changed: true,
              });
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
              previews.push({
                id: game.id,
                title: game.title,
                before: beforeLines.join("\n"),
                after: afterLines.join("\n"),
                changed: true,
              });
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
    .use(requireScope("video:moderate"))
    .input(
      z.object({
        gameIds: z.array(z.string()).min(1).max(500),
        field: z.enum([
          "title",
          "description",
          "coverUrl",
          "gameType",
          "version",
          "extraInfo.downloads.url",
          "extraInfo.downloads.name",
          "extraInfo.downloads.password",
          "extraInfo.screenshots",
          "extraInfo.videos",
          "extraInfo.originalName",
          "extraInfo.authorUrl",
          "extraInfo.characterIntro",
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

      const games = await ctx.prisma.game.findMany({
        where: { id: { in: input.gameIds } },
        select: {
          id: true,
          title: true,
          description: true,
          coverUrl: true,
          gameType: true,
          version: true,
          extraInfo: true,
        },
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
            void safeSync(syncGame(game.id));
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
            void safeSync(syncGame(game.id));
            updatedCount++;
          }
        }
      }

      return { success: true, count: updatedCount };
    }),
});
