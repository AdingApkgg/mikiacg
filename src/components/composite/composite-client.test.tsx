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
  useUIStore: (selector: (state: { setContentMode: () => void }) => unknown) => selector({ setContentMode: vi.fn() }),
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

vi.mock("@/components/shared/horizontal-scroller", () => ({
  HorizontalScroller: () => {
    throw new Error("最新视频不应使用 HorizontalScroller");
  },
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
  VideoCard: ({ video }: { video: { title: string } }) => <article data-testid="video-card">{video.title}</article>,
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

function createVideo(id: string, title = id) {
  return {
    id,
    title,
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
}

function createImage(id: string, title = id) {
  return { ...createVideo(id, title), description: null, images: ["/image.jpg"] };
}

function createGame(id: string, title = id) {
  return { ...createVideo(id, title), description: null, gameType: "ADV", isFree: true, version: null };
}

describe("CompositeClient", () => {
  it("无广告时不渲染顶部广告入口", async () => {
    const { CompositeClient } = await import("./composite-client");

    const html = renderToStaticMarkup(
      <CompositeClient
        initialVideos={[]}
        initialImages={[]}
        initialGames={[]}
        hotVideos={[]}
        hotImages={[]}
        hotGames={[]}
      />,
    );

    expect(html).not.toContain('data-testid="header-banner"');
  });

  it("不渲染热门标签 section 和 tags 锚点", async () => {
    const { CompositeClient } = await import("./composite-client");
    const item = createVideo("item-1", "测试内容");
    const image = createImage("image-1", "测试图集");
    const game = createGame("game-1", "测试游戏");

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

  it("首页锚点导航使用 Header 下方的 sticky offset", async () => {
    const { CompositeClient } = await import("./composite-client");
    const item = createVideo("item-1", "测试内容");
    const image = createImage("image-1", "测试图集");
    const game = createGame("game-1", "测试游戏");

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

    expect(html).toContain('style="top:56px"');
  });

  it("最新视频最多渲染 8 张卡片并使用网格布局", async () => {
    const { CompositeClient } = await import("./composite-client");
    const videos = Array.from({ length: 10 }, (_, i) => createVideo(`video-${i + 1}`, `视频 ${i + 1}`));

    const html = renderToStaticMarkup(
      <CompositeClient
        initialVideos={videos}
        initialImages={[]}
        initialGames={[]}
        hotVideos={[]}
        hotImages={[]}
        hotGames={[]}
      />,
    );

    expect(html.match(/data-testid="video-card"/g)).toHaveLength(8);
    expect(html).toContain("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4");
    expect(html).toContain("视频 8");
    expect(html).not.toContain("视频 9");
  });

  it("最新游戏 section 出现在最新图集前面", async () => {
    const { CompositeClient } = await import("./composite-client");
    const image = createImage("image-1", "测试图集");
    const game = createGame("game-1", "测试游戏");

    const html = renderToStaticMarkup(
      <CompositeClient
        initialVideos={[]}
        initialImages={[image]}
        initialGames={[game]}
        hotVideos={[]}
        hotImages={[]}
        hotGames={[]}
      />,
    );

    expect(html.indexOf('id="latest-game"')).toBeLessThan(html.indexOf('id="latest-image"'));
  });
});
