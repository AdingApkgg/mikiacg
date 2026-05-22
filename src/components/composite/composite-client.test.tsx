import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ads/header-banner", () => ({
  HeaderBannerCarousel: () => <div data-testid="header-banner" />,
}));

vi.mock("@/components/ads/ad-card", () => ({
  AdCard: () => <div data-testid="ad-card" />,
}));

vi.mock("@/hooks/use-ads", () => ({
  useRandomAds: () => ({ ads: [], showAds: false }),
}));

vi.mock("@/stores/app", () => ({
  useUIStore: (selector: (state: { setContentMode: () => void }) => unknown) =>
    selector({ setContentMode: vi.fn() }),
}));

vi.mock("@/contexts/site-config", () => ({
  useSiteConfig: () => ({
    announcement: null,
    announcementEnabled: false,
    sectionVideoEnabled: true,
    sectionImageEnabled: true,
    sectionGameEnabled: true,
  }),
}));

vi.mock("@/components/shared/announcement-banner", () => ({
  AnnouncementBanner: () => <div data-testid="announcement" />,
}));

vi.mock("./composite-hero", () => ({
  CompositeHero: () => <section data-testid="hero">本月热门</section>,
}));

vi.mock("./composite-mixed-hot", () => ({
  CompositeMixedHot: () => <section data-testid="mixed-hot">综合热门</section>,
}));

vi.mock("./composite-weekly-ranking", () => ({
  CompositeWeeklyRanking: () => <section data-testid="ranking">本月排行</section>,
}));

vi.mock("@/components/video/video-card", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <article>{video.title}</article>,
}));

vi.mock("@/components/image/image-post-card", () => ({
  ImagePostCard: ({ post }: { post: { title: string } }) => <article>{post.title}</article>,
}));

vi.mock("@/components/image/image-masonry", () => ({
  ImageMasonry: () => <div data-testid="image-masonry" />,
}));

vi.mock("@/components/game/game-card", () => ({
  GameCard: ({ game }: { game: { title: string } }) => <article>{game.title}</article>,
}));

describe("CompositeClient", () => {
  it("不渲染热门标签 section 和 tags 锚点", async () => {
    const { CompositeClient } = await import("./composite-client");
    const item = {
      id: "item-1",
      title: "测试内容",
      coverUrl: null,
      duration: 60,
      views: 1,
      isNsfw: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      extraInfo: null,
      uploader: { id: "user-1", username: "user", nickname: null, avatar: null },
      tags: [],
      _count: { likes: 0, dislikes: 0, favorites: 0 },
    };
    const image = { ...item, description: null, images: ["/image.jpg"] };
    const game = { ...item, description: null, gameType: "ADV", isFree: true, version: null };

    const html = renderToStaticMarkup(
      <CompositeClient
        initialVideos={[item]}
        initialImages={[image]}
        initialGames={[game]}
        hotVideos={[item, { ...item, id: "video-hot-2" }]}
        hotImages={[image, { ...image, id: "image-hot-2" }]}
        hotGames={[game, { ...game, id: "game-hot-2" }]}
      />,
    );

    expect(html).not.toContain("热门标签");
    expect(html).not.toContain('id="tags"');
    expect(html).not.toContain(">标签</button>");
  });
});
