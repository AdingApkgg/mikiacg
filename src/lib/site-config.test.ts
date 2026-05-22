import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteConfig: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

function resetPublicSiteConfigCache() {
  delete (globalThis as unknown as { __publicSiteConfig?: unknown }).__publicSiteConfig;
}

describe("getPublicSiteConfig", () => {
  beforeEach(() => {
    resetPublicSiteConfigCache();
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
  });

  it("保留管理员保存的图片排序选项", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "default",
      imageSortOptions: "latest,views",
    });

    const { getPublicSiteConfig } = await import("./site-config");

    await expect(getPublicSiteConfig()).resolves.toMatchObject({
      imageSortOptions: "latest,views",
    });
  });

  it("仅在图片排序选项缺省时使用新默认值", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "default",
      imageSortOptions: "",
    });

    const { getPublicSiteConfig } = await import("./site-config");

    await expect(getPublicSiteConfig()).resolves.toMatchObject({
      imageSortOptions: "latest,views,likes",
    });
  });
});
