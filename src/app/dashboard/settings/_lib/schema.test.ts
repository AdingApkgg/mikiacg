import type { SiteConfig } from "@/generated/prisma/client";
import { describe, expect, it } from "vitest";
import { pickFeaturesValues } from "./schema";

const baseConfig = {
  allowRegistration: true,
  allowUpload: true,
  allowComment: true,
  requireLoginToComment: false,
  requireEmailVerify: false,
  sectionCompositeEnabled: true,
  sectionVideoEnabled: true,
  sectionImageEnabled: true,
  sectionGameEnabled: true,
  videoSortOptions: "latest,views,likes",
  gameSortOptions: "latest,views,likes",
  videoDefaultSort: "latest",
  gameDefaultSort: "latest",
  imageDefaultSort: "latest",
  usdtPaymentEnabled: false,
  usdtWalletAddress: null,
  usdtPointsPerUnit: 10000,
  usdtOrderTimeoutMin: 30,
  usdtMinAmount: null,
  usdtMaxAmount: null,
} as unknown as SiteConfig;

describe("pickFeaturesValues", () => {
  it("保留管理员保存的图片排序选项", () => {
    const values = pickFeaturesValues({
      ...baseConfig,
      imageSortOptions: "latest,views",
    });

    expect(values.imageSortOptions).toBe("latest,views");
  });

  it("仅在图片排序选项缺省时使用新默认值", () => {
    const values = pickFeaturesValues({
      ...baseConfig,
      imageSortOptions: "",
    });

    expect(values.imageSortOptions).toBe("latest,views,likes");
  });
});
