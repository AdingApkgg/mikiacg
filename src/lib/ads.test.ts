import { describe, expect, it } from "vitest";
import { isAdForPosition, parseSponsorAds, type Ad } from "./ads";

function makeAd(overrides: Partial<Ad> = {}): Ad {
  return {
    id: "ad-1",
    title: "测试广告",
    platform: "demo",
    url: "https://example.com",
    imageUrl: "/banner.jpg",
    weight: 1,
    enabled: true,
    positions: ["all"],
    kind: "image",
    ...overrides,
  };
}

describe("ads position matching", () => {
  it("header-carousel 只匹配显式配置的广告位", () => {
    expect(isAdForPosition(makeAd({ positions: ["all"] }), "header-carousel")).toBe(false);
    expect(isAdForPosition(makeAd({ positions: ["header-carousel"] }), "header-carousel")).toBe(true);
  });

  it("旧数据缺失 positions 时默认 all，但不会匹配 header-carousel", () => {
    const [legacyAd] = parseSponsorAds([{ id: "legacy", title: "旧广告" }]);

    expect(legacyAd.positions).toEqual(["all"]);
    expect(isAdForPosition(legacyAd, "header-carousel")).toBe(false);
  });

  it("all 仍可匹配非顶部轮播广告位", () => {
    expect(isAdForPosition(makeAd({ positions: ["all"] }), "in-feed")).toBe(true);
  });
});
