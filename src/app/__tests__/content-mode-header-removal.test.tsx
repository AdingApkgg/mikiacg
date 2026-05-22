import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  defaultSiteConfig: {
    announcement: null,
    announcementEnabled: false,
    videoSortOptions: "latest,views,likes",
    videoDefaultSort: "latest",
    imageSortOptions: "latest,views,likes",
    imageDefaultSort: "latest",
    gameSortOptions: "latest,views,likes",
    gameDefaultSort: "latest",
  },
  searchParams: new URLSearchParams(""),
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
  videoListInputs: [] as unknown[],
  imageListInputs: [] as unknown[],
  gameListInputs: [] as unknown[],
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
    isFetching: false,
    isPlaceholderData: false,
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
          uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
          _count: { likes: 1 },
        },
      ],
      totalPages: 1,
    },
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
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
      list: {
        useQuery: (input: unknown) => {
          mocks.videoListInputs.push(input);
          return mocks.videoListResult;
        },
      },
      listAuthors: { useQuery: () => ({ data: { items: [], totalPages: 1 }, isLoading: false }) },
      progressMap: { useQuery: () => ({ data: { progressByVideoId: {} } }) },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
    image: {
      list: {
        useQuery: (input: unknown) => {
          mocks.imageListInputs.push(input);
          return mocks.imageListResult;
        },
      },
      favoritedMap: { useQuery: () => ({ data: { favoritedIds: [] } }) },
    },
    game: {
      list: {
        useQuery: (input: unknown) => {
          mocks.gameListInputs.push(input);
          return mocks.gameListResult;
        },
      },
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

vi.mock("@/components/image/image-masonry", () => ({
  ImageMasonry: ({ items }: { items: { key: string; node: React.ReactNode }[] }) => (
    <div data-testid="image-masonry">
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
    </div>
  ),
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
  GameFeedSections: () => (
    <section data-testid="game-feed">
      <h2>最新上架</h2>
      <h2>热门游戏</h2>
      <h2>高赞排行</h2>
    </section>
  ),
}));

const FEED_SECTION_TITLES = ["最新发布", "最新上架", "热门视频", "热门图集", "热门游戏", "高赞排行"];

function expectNoRepeatedFeedSections(html: string) {
  expect(html).not.toContain('data-testid="video-feed"');
  expect(html).not.toContain('data-testid="image-feed"');
  expect(html).not.toContain('data-testid="game-feed"');
  for (const title of FEED_SECTION_TITLES) {
    expect(html).not.toContain(title);
  }
}

describe("front content pages", () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams("");
    mocks.pathname = "/video";
    mocks.siteConfig = { ...mocks.defaultSiteConfig };
    mocks.videoListInputs = [];
    mocks.imageListInputs = [];
    mocks.gameListInputs = [];
    mocks.videoListResult = {
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
      isFetching: false,
      isPlaceholderData: false,
    };
    mocks.imageListResult = {
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
    };
    mocks.gameListResult = {
      data: {
        games: [
          {
            id: "game-1",
            title: "测试游戏",
            coverUrl: null,
            views: 10,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
            _count: { likes: 1 },
          },
        ],
        totalPages: 1,
      },
      isLoading: false,
      isFetching: false,
      isPlaceholderData: false,
    };
    vi.clearAllMocks();
  });

  it("/video 默认页只渲染 VideoGrid 单一列表，不渲染重复 Feed section", async () => {
    const { default: VideoListClient } = await import("../video/client");
    const html = renderToStaticMarkup(
      <VideoListClient initialVideos={[]} siteConfig={{ announcement: null, announcementEnabled: false }} />,
    );

    expectNoRepeatedFeedSections(html);
    expect(html).toContain('data-testid="video-grid"');
    expect(html).toContain("测试视频");
    expect(mocks.videoListInputs.at(-1)).toMatchObject({ sortBy: "latest" });
  });

  it("/image 默认页只渲染 ImageMasonry 单一列表，不渲染重复 Feed section", async () => {
    mocks.pathname = "/image";
    const { ImageListClient } = await import("../image/client");
    const html = renderToStaticMarkup(<ImageListClient initialPosts={[]} />);

    expectNoRepeatedFeedSections(html);
    expect(html).toContain('data-testid="image-masonry"');
    expect(html).toContain("测试图片");
    expect(mocks.imageListInputs.at(-1)).toMatchObject({ sortBy: "latest" });
  });

  it("/game 默认页只渲染 GameGrid 单一列表，不渲染重复 Feed section", async () => {
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expectNoRepeatedFeedSections(html);
    expect(html).toContain('data-testid="game-grid"');
    expect(html).toContain("测试游戏");
    expect(mocks.gameListInputs.at(-1)).toMatchObject({ sortBy: "latest" });
  });

  it("URL sortBy 参数仍控制 /video、/image、/game 的单一列表查询", async () => {
    const { default: VideoListClient } = await import("../video/client");
    const { ImageListClient } = await import("../image/client");
    const { GameListClient } = await import("../game/client");

    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/video";
    const videoHtml = renderToStaticMarkup(
      <VideoListClient initialVideos={[]} siteConfig={{ announcement: null, announcementEnabled: false }} />,
    );
    expectNoRepeatedFeedSections(videoHtml);
    expect(mocks.videoListInputs.at(-1)).toMatchObject({ sortBy: "views" });

    mocks.searchParams = new URLSearchParams("sortBy=likes");
    mocks.pathname = "/image";
    const imageHtml = renderToStaticMarkup(<ImageListClient initialPosts={[]} />);
    expectNoRepeatedFeedSections(imageHtml);
    expect(mocks.imageListInputs.at(-1)).toMatchObject({ sortBy: "likes" });

    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/game";
    const gameHtml = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );
    expectNoRepeatedFeedSections(gameHtml);
    expect(mocks.gameListInputs.at(-1)).toMatchObject({ sortBy: "views" });
  });

  it("URL sortBy=views/likes 且 query loading 时不渲染错误的 initial 数据", async () => {
    const { default: VideoListClient } = await import("../video/client");
    const { ImageListClient } = await import("../image/client");
    const { GameListClient } = await import("../game/client");

    mocks.videoListResult = {
      data: undefined as never,
      isLoading: true,
      isFetching: true,
      isPlaceholderData: false,
    };
    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/video";
    const videoHtml = renderToStaticMarkup(
      <VideoListClient
        initialVideos={[
          {
            id: "initial-video",
            title: "错误初始视频",
            coverUrl: null,
            duration: 60,
            views: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
            _count: { likes: 1 },
          },
        ]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );
    expect(videoHtml).toContain('data-testid="video-grid"');
    expect(videoHtml).not.toContain("错误初始视频");

    mocks.imageListResult = { data: undefined as never, isLoading: true, isFetching: true };
    mocks.searchParams = new URLSearchParams("sortBy=likes");
    mocks.pathname = "/image";
    const imageHtml = renderToStaticMarkup(
      <ImageListClient
        initialPosts={[
          {
            id: "initial-image",
            title: "错误初始图片",
            images: ["/image.jpg"],
            views: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
          },
        ]}
      />,
    );
    expect(imageHtml).toContain('data-testid="image-masonry"');
    expect(imageHtml).not.toContain("错误初始图片");

    mocks.gameListResult = {
      data: undefined as never,
      isLoading: true,
      isFetching: true,
      isPlaceholderData: false,
    };
    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/game";
    const gameHtml = renderToStaticMarkup(
      <GameListClient
        initialGames={[
          {
            id: "initial-game",
            title: "错误初始游戏",
            coverUrl: null,
            views: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
            _count: { likes: 1 },
          },
        ]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );
    expect(gameHtml).toContain('data-testid="game-grid"');
    expect(gameHtml).not.toContain("错误初始游戏");
  });

  it("/video 和 /game 排序切换请求未完成前不渲染上一轮 latest 占位数据", async () => {
    const { default: VideoListClient } = await import("../video/client");
    const { GameListClient } = await import("../game/client");

    mocks.videoListResult = {
      data: {
        videos: [
          {
            id: "old-latest-video",
            title: "上一轮最新视频",
            coverUrl: null,
            duration: 60,
            views: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
            _count: { likes: 1 },
          },
        ],
        totalPages: 1,
      },
      isLoading: false,
      isFetching: true,
      isPlaceholderData: true,
    };
    mocks.searchParams = new URLSearchParams("sortBy=views");
    mocks.pathname = "/video";
    const videoHtml = renderToStaticMarkup(
      <VideoListClient initialVideos={[]} siteConfig={{ announcement: null, announcementEnabled: false }} />,
    );
    expect(videoHtml).toContain('data-testid="video-grid"');
    expect(videoHtml).not.toContain("上一轮最新视频");

    mocks.gameListResult = {
      data: {
        games: [
          {
            id: "old-latest-game",
            title: "上一轮最新游戏",
            coverUrl: null,
            views: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploader: { id: "user-1", username: "uploader", nickname: null, avatar: null },
            _count: { likes: 1 },
          },
        ],
        totalPages: 1,
      },
      isLoading: false,
      isFetching: true,
      isPlaceholderData: true,
    };
    mocks.searchParams = new URLSearchParams("sortBy=likes");
    mocks.pathname = "/game";
    const gameHtml = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );
    expect(gameHtml).toContain('data-testid="game-grid"');
    expect(gameHtml).not.toContain("上一轮最新游戏");
  });

  it("/image 保留已保存排序选项，仅缺省配置时回退到包含高赞的默认值", async () => {
    mocks.siteConfig.imageSortOptions = "latest,views";
    mocks.pathname = "/image";
    const { ImageListClient } = await import("../image/client");
    const savedOptionsHtml = renderToStaticMarkup(<ImageListClient initialPosts={[]} />);

    expect(savedOptionsHtml).toContain("最新");
    expect(savedOptionsHtml).toContain("热门");
    expect(savedOptionsHtml).not.toContain("高赞");

    mocks.siteConfig.imageSortOptions = undefined as unknown as string;
    const missingConfigHtml = renderToStaticMarkup(<ImageListClient initialPosts={[]} />);
    expect(missingConfigHtml).toContain("高赞");
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

  it("/video 作者网格约束长作者名和长预览标题，不撑宽页面", async () => {
    const { VideoAuthorsGrid } = await import("../video/client");
    const longAuthor =
      "very-long-author-name-with-url-like-text-https-example-com-path-segment-that-should-not-expand-the-card";
    const html = renderToStaticMarkup(
      <VideoAuthorsGrid
        items={[
          {
            author: longAuthor,
            videoCount: 123456,
            totalViews: 9876543210,
            previewVideos: [
              {
                id: "video-long",
                coverUrl: null,
                title:
                  "very-long-video-title-with-url-like-text-https-example-com-video-title-that-should-not-expand-preview",
              },
            ],
          },
        ]}
        isLoading={false}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onAuthorClick={vi.fn()}
        coverSrc={(id) => `/cover/${id}.jpg`}
      />,
    );

    expect(html).toContain("w-full min-w-0 max-w-full");
    expect(html).toContain("block min-w-0 w-full max-w-full overflow-hidden");
    expect(html).toContain("min-w-0 flex-1 truncate break-all");
    expect(html).toContain(longAuthor);
  });

  it("/game 默认列表模式保留游戏类型筛选行和作品/作者切换", async () => {
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

    expectNoRepeatedFeedSections(html);
    expect(html).toContain("全部");
    expect(html).toContain("SLG");
    expect(html).toContain("作品");
    expect(html).toContain("作者");
  });

  it("/game?sortBy=likes 列表模式仍渲染游戏类型筛选行", async () => {
    mocks.searchParams = new URLSearchParams("sortBy=likes");
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[{ type: "SLG", count: 1 }]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expectNoRepeatedFeedSections(html);
    expect(html).toContain("全部");
    expect(html).toContain("SLG");
    expect(mocks.gameListInputs.at(-1)).toMatchObject({ sortBy: "likes" });
  });

  it("游戏类型只有全部时不渲染孤立筛选行", async () => {
    mocks.searchParams = new URLSearchParams("");
    mocks.pathname = "/game";
    const { GameListClient } = await import("../game/client");
    const html = renderToStaticMarkup(
      <GameListClient
        initialGames={[]}
        typeStats={[]}
        siteConfig={{ announcement: null, announcementEnabled: false }}
      />,
    );

    expectNoRepeatedFeedSections(html);
    expect(html).not.toContain("全部");
  });
});
