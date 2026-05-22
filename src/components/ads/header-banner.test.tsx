// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ad } from "@/lib/ads";

const mocks = vi.hoisted(() => ({
  ads: [] as Ad[],
  showAds: true,
}));

vi.mock("@/hooks/use-redirect-options", () => ({
  useRedirectOptions: () => ({}),
}));

vi.mock("@/hooks/use-ads", () => ({
  useRandomAds: () => ({ ads: mocks.ads, showAds: mocks.showAds }),
}));

function makeAd(overrides: Partial<Ad> = {}): Ad {
  return {
    id: "ad-1",
    title: "测试广告",
    platform: "demo",
    url: "https://example.com",
    imageUrl: "/banner.jpg",
    images: undefined,
    weight: 1,
    enabled: true,
    positions: ["header-carousel"],
    kind: "image",
    ...overrides,
  };
}

async function renderCarousel() {
  const { HeaderBannerCarousel } = await import("./header-banner");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<HeaderBannerCarousel />);
  });
  return { container, root };
}

describe("HeaderBannerCarousel", () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = "";
    mocks.ads = [];
    mocks.showAds = true;
    vi.resetModules();
  });

  it("无有效 header-carousel 图片广告时不渲染空容器", async () => {
    mocks.ads = [makeAd({ id: "empty-image", imageUrl: "", images: undefined })];
    const rendered = await renderCarousel();
    roots.push(rendered.root);

    expect(rendered.container.innerHTML).toBe("");
  });

  it("广告图片加载失败后移除轮播占位", async () => {
    mocks.ads = [makeAd({ id: "broken-image", imageUrl: "/broken.jpg" })];
    const rendered = await renderCarousel();
    roots.push(rendered.root);
    const image = rendered.container.querySelector("img");

    expect(image).not.toBeNull();

    await act(async () => {
      image?.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(rendered.container.innerHTML).toBe("");
  });
});
