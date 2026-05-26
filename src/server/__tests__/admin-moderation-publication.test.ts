import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redis", () => ({ REDIS_AVAILABLE: false, redis: {} }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

import type { Context } from "../trpc";
import { createCallerFactory } from "../trpc";
import { adminGamesRouter } from "../routers/admin/games";
import { adminImagesRouter } from "../routers/admin/images";
import { adminVideosRouter } from "../routers/admin/videos";
import { createOwnerContext } from "./helpers";

vi.mock("@/lib/meilisearch", () => ({
  safeSync: vi.fn(),
}));

vi.mock("@/lib/notification", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/indexnow", () => ({
  submitGameToIndexNow: vi.fn(() => Promise.resolve()),
  submitGamesToIndexNow: vi.fn(() => Promise.resolve()),
  submitImagePostToIndexNow: vi.fn(() => Promise.resolve()),
  submitImagePostsToIndexNow: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/search-sync", () => ({
  deleteGame: vi.fn(() => Promise.resolve()),
  deleteImagePost: vi.fn(() => Promise.resolve()),
  deleteVideo: vi.fn(() => Promise.resolve()),
  syncGame: vi.fn(() => Promise.resolve()),
  syncImagePost: vi.fn(() => Promise.resolve()),
  syncVideo: vi.fn(() => Promise.resolve()),
}));

type MockPrisma = {
  user: { findUnique: ReturnType<typeof vi.fn> };
  video: {
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  game: {
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  imagePost: {
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

function createModerationContext(): { ctx: Context; prisma: MockPrisma } {
  const prisma = {} as MockPrisma;
  prisma.user = {
    findUnique: vi.fn(async () => ({ role: "OWNER", adminScopes: null, group: null })),
  };
  prisma.video = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };
  prisma.game = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };
  prisma.imagePost = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (callback: (tx: MockPrisma) => unknown) => callback(prisma));

  return { ctx: createOwnerContext({ prisma: prisma as unknown as Context["prisma"] }), prisma };
}

describe("admin video moderation publication time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets publishedAt when a single video is approved from a non-published status", async () => {
    const { ctx, prisma } = createModerationContext();
    prisma.video.updateMany.mockResolvedValue({ count: 1 });
    prisma.video.findUnique.mockResolvedValue({ id: "v1", title: "Video 1", status: "PUBLISHED", uploaderId: "u1" });

    const result = await createCallerFactory(adminVideosRouter)(ctx).moderateVideo({
      videoId: "v1",
      status: "PUBLISHED",
    });

    expect(result.success).toBe(true);
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
  });

  it("does not refresh publishedAt for an already-published video approval", async () => {
    const { ctx, prisma } = createModerationContext();
    prisma.video.updateMany.mockResolvedValue({ count: 0 });
    prisma.video.findUnique.mockResolvedValue({ id: "v1", title: "Video 1", status: "PUBLISHED", uploaderId: "u1" });

    await createCallerFactory(adminVideosRouter)(ctx).moderateVideo({ videoId: "v1", status: "PUBLISHED" });

    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
  });

  it("sets publishedAt for batch approvals and returns changed count plus target count", async () => {
    const { ctx, prisma } = createModerationContext();
    prisma.video.count.mockResolvedValue(3);
    prisma.video.updateMany.mockResolvedValue({ count: 2 });

    const result = await createCallerFactory(adminVideosRouter)(ctx).batchModerateVideos({
      videoIds: ["v3", "v2", "v1"],
      status: "PUBLISHED",
    });

    expect(result).toEqual({ success: true, count: 2, targetCount: 3 });
    expect(prisma.video.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v3", "v2", "v1"] }, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
  });

  it("uses the same single approval publication rule for games and images", async () => {
    const { ctx, prisma } = createModerationContext();
    prisma.game.updateMany.mockResolvedValue({ count: 1 });
    prisma.game.findUnique.mockResolvedValue({ id: "g1" });
    prisma.imagePost.updateMany.mockResolvedValue({ count: 1 });
    prisma.imagePost.findUnique.mockResolvedValue({ id: "i1" });

    await createCallerFactory(adminGamesRouter)(ctx).moderateGame({ gameId: "g1", status: "PUBLISHED" });
    await createCallerFactory(adminImagesRouter)(ctx).moderateImage({ imageId: "i1", status: "PUBLISHED" });

    expect(prisma.game.updateMany).toHaveBeenCalledWith({
      where: { id: "g1", status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
    expect(prisma.imagePost.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
  });

  it("uses changed count and target count for game and image batch approvals", async () => {
    const { ctx, prisma } = createModerationContext();
    prisma.game.count.mockResolvedValue(3);
    prisma.game.updateMany.mockResolvedValue({ count: 2 });
    prisma.imagePost.count.mockResolvedValue(4);
    prisma.imagePost.updateMany.mockResolvedValue({ count: 1 });

    const gameResult = await createCallerFactory(adminGamesRouter)(ctx).batchModerateGames({
      gameIds: ["g3", "g2", "g1"],
      status: "PUBLISHED",
    });
    const imageResult = await createCallerFactory(adminImagesRouter)(ctx).batchModerateImages({
      imageIds: ["i4", "i3", "i2", "i1"],
      status: "PUBLISHED",
    });

    expect(gameResult).toEqual({ success: true, count: 2, targetCount: 3 });
    expect(imageResult).toEqual({ success: true, count: 1, targetCount: 4 });
    expect(prisma.game.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["g3", "g2", "g1"] }, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
    expect(prisma.imagePost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["i4", "i3", "i2", "i1"] }, status: { not: "PUBLISHED" } },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
  });
});
