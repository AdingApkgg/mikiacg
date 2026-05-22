import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams("sortBy=views"),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  pathname: "/video",
  setPage: vi.fn(),
  setContentMode: vi.fn(),
  chooseContentMode: vi.fn(),
  toggleTag: vi.fn(),
  toggleExclude: vi.fn(),
  clearAll: vi.fn(),
  siteConfig: {
    announcement: null,
    announcementEnabled: false,
    videoSortOptions: "latest,views,likes",
    videoDefaultSort: "latest",
    imageSortOptions: "latest,views,likes",
    imageDefaultSort: "latest",
    gameSortOptions: "latest,views,likes",
    gameDefaultSort: "latest",
  },
  videoListResult: {
    data: {
      videos: [
        {
          id: "video-1",
          title: "测试视频",
          coverUrl: null,
          duration: 60,
          views: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
          _count: { likes: 1 },
        },
      ],
      totalPages: 1,
    },
    isLoading: false,
  },
  imageListResult: {
    data: {
      posts: [
        {
          id: "image-1",
          title: "测试图片",
          images: ["/image.jpg"],
          views: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
        },
      ],
      totalPages: 1,
    },
    isLoading: false,
    isFetching: false,
  },
  gameListResult: {
    data: {
      games: [
        {
          id: "game-1",
          title: "测试游戏",
          coverUrl: null,
          views: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
          _count: { likes: 1 },
        },
      ],
      totalPages: 1,
    },
    isLoading: false,
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  useRouter: () => mocks.router,
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    video: {
      list: { useQuery: () => mocks.videoListResult },
      listAuthors: { useQuery: () => ({ data: { items: [], totalPages: 1 }, isLoading: false }) },
      progressMap: { useQuery: () => ({ data: { progressByVideoId: {} } }) },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
    image: {
      list: { useQuery: () => mocks.imageListResult },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
    game: {
      list: { useQuery: () => mocks.gameListResult },
      listAuthors: { useQuery: () => ({ data: { items: [], totalPages: 1 }, isLoading: false }) },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
  },
}));

vi.mock("@/hooks/use-page-param", () => ({
  usePageParam: () => [1, mocks.setPage],
}));

vi.mock("@/hooks/use-tag-filter", () => ({
  useTagFilter: () => ({
    selectedSlugs: [],
    excludedSlugs: [],
    toggleTag: mocks.toggleTag,
    toggleExclude: mocks.toggleExclude,
    clearAll: mocks.clearAll,
    isSelected: () => false,
    isExcluded: () => false,
    hasFilter: false,
  }),
}));

vi.mock("@/hooks/use-inline-ads", () => ({
  useInlineAds: ({ items }: { items: unknown[] }) => ({
    gridItems: items.map((data) => ({ type: "item", data })),
    pickedAds: [],
    hasAds: false,
  }),
}));

vi.mock("@/hooks/use-thumb", () => ({
  useVideoCoverThumb: () => false,
}));

vi.mock("@/stores/app", () => ({
  useUIStore: (selector: (state: { setContentMode: () => void; chooseContentMode: () => void }) => unknown) =>
    selector({ setContentMode: mocks.setContentMode, chooseContentMode: mocks.chooseContentMode }),
}));

vi.mock("@/contexts/site-config", () => ({
  useSiteConfig: () => mocks.siteConfig,
}));

vi.mock("@/components/motion", () => ({
  MotionPage: ({ children }: { children: React.ReactNode }) => children,
  MotionList: ({ children }: { children: React.ReactNode }) => children,
  MotionItem: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ads/header-banner", () => ({
  HeaderBannerCarousel: () => <div data-testid="header-banner" />,
}));

vi.mock("@/components/ads/ad-card", () => ({
  AdCard: () => <div data-testid="ad-card" />,
}));

vi.mock("@/components/shared/announcement-banner", () => ({
  AnnouncementBanner: () => <div data-testid="announcement" />,
}));

vi.mock("@/components/ui/collapsible-tag-bar", () => ({
  CollapsibleTagBar: ({ children }: { children: React.ReactNode }) => <div data-testid="tag-bar">{children}</div>,
}));

vi.mock("@/components/ui/pagination", () => ({
  Pagination: () => <nav aria-label="分页" />,
}));

vi.mock("@/components/video/video-grid", () => ({
  VideoGrid: ({ videos }: { videos: { title: string }[] }) => (
    <div data-testid="video-grid">{videos.map((video) => video.title).join(",")}</div>
  ),
}));

vi.mock("@/components/video/video-card", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <article>{video.title}</article>,
}));

vi.mock("@/components/video/video-feed-sections", () => ({
  VideoFeedSections: () => <section data-testid="video-feed" />,
}));

vi.mock("@/components/image/image-feed-sections", () => ({
  ImageFeedSections: () => <section data-testid="image-feed" />,
}));

vi.mock("@/components/image/image-masonry", () => ({
  ImageMasonry: () => <div data-testid="image-masonry" />,
}));

vi.mock("@/components/image/image-post-card", () => ({
  ImagePostCard: ({ post }: { post: { title: string } }) => <article>{post.title}</article>,
}));

vi.mock("@/components/game/game-grid", () => ({
  GameGrid: ({ games }: { games: { title: string }[] }) => (
    <div data-testid="game-grid">{games.map((game) => game.title).join(",")}</div>
  ),
}));

vi.mock("@/components/game/game-card", () => ({
  GameCard: ({ game }: { game: { title: string } }) => <article>{game.title}</article>,
}));

vi.mock("@/components/game/game-feed-sections", () => ({
  GameFeedSections: () => <section data-testid="game-feed" />,
}));

describe("front content pages", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/video";
    vi.clearAllMocks();
  });

  it("/video 不再渲染内容分区切换条和标签筛选栏，列表仍存在", async () => {
    const { default: VideoListClient } = await import("../video/client");
    const html = renderToStaticMarkup(
      <VideoListClient
        initialVideos={[]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('aria-label="内容分区"');
    expect(html).not.toContain('data-testid="tag-bar"');
    expect(html).toContain("热门");
    expect(html).toContain("测试视频");
  });

  it("/image 不再渲染内容分区切换条和标签筛选栏，列表仍存在", async () => {
    mocks.pathname = "/image";
    const { ImageListClient } = await import("../image/client");
    const html = renderToStaticMarkup(<ImageListClient initialPosts={[]} />);

    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('aria-label="内容分区"');
    expect(html).not.toContain('data-testid="tag-bar"');
    expect(html).toContain("热门");
    expect(html).toContain('data-testid="image-masonry"');
  });

  it("/game 不再渲染内容分区切换条和标签筛选栏，列表仍存在", async () => {
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('aria-label="内容分区"');
    expect(html).not.toContain('data-testid="tag-bar"');
    expect(html).toContain("SLG");
    expect(html).toContain("测试游戏");
  });

  it("/video 作者模式下视频/作者切换控件仍右对齐", async () => {
    const { VideoViewModeHeader } = await import("../video/client");
    const html = renderToStaticMarkup(
      <VideoViewModeHeader
        viewMode="authors"
        viewModeOptions={[
          { id: "videos", label: "视频" },
          { id: "authors", label: "作者" },
        ]}
        sortOptions={[
          { id: "latest", label: "最新" },
          { id: "views", label: "热门" },
        ]}
        sortBy="latest"
        onSortChange={vi.fn()}
        onViewModeChange={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="video-view-mode-header"');
    expect(html).toContain("justify-end");
    expect(html).toContain("视频");
    expect(html).toContain("作者");
  });

  it("/game 首页模式不渲染游戏类型筛选行", async () => {
    mocks.searchParams = new URLSearchParams("");
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expect(html).toContain('data-testid="game-feed"');
    expect(html).not.toContain("SLG");
    expect(html).not.toContain("全部");
  });

  it("/game?sortBy=latest 列表模式渲染游戏类型筛选行", async () => {
    mocks.searchParams = new URLSearchParams("sortBy=latest");
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expect(html).not.toContain('data-testid="game-feed"');
    expect(html).toContain("全部");
    expect(html).toContain("SLG");
  });

  it("游戏类型只有全部时不渲染孤立筛选行", async () => {
    mocks.searchParams = new URLSearchParams("sortBy=latest");
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expect(html).not.toContain("全部");
  });
});
