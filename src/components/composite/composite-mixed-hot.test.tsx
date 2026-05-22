import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
    fill?: boolean;
    priority?: boolean;
    sizes?: string;
    unoptimized?: boolean;
    onLoad?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

vi.mock("@/components/video/video-card", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <article data-kind="video">{video.title}</article>,
}));

vi.mock("@/components/game/game-card", () => ({
  GameCard: ({ game }: { game: { title: string } }) => <article data-kind="game">{game.title}</article>,
}));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({ play: vi.fn() }),
}));

vi.mock("@/hooks/use-thumb", () => ({
  useThumb:
    (preset: string) =>
    (src: string, override?: { h?: number }) =>
      `${src}?preset=${preset}${override?.h !== undefined ? `&h=${override.h}` : ""}`,
}));

vi.mock("@/hooks/use-in-view-once", () => ({
  useInViewOnce: () => ({ ref: { current: null }, inView: true }),
}));

vi.mock("@/hooks/use-image-aspect-cache", () => ({
  getCachedAspect: () => 3 / 4,
  setCachedAspect: vi.fn(),
}));

vi.mock("@/components/shared/hover-favorite-button", () => ({
  HoverFavoriteButton: () => <button type="button" data-testid="favorite" />,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ image: { favoritedMap: { invalidate: vi.fn() } } }),
    image: {
      toggleFavorite: {
        useMutation: () => ({ mutateAsync: vi.fn(async () => ({ favorited: true })) }),
      },
    },
  },
}));

const baseUser = {
  id: "user-1",
  username: "uploader",
  nickname: "作者",
  avatar: null,
};

const video = {
  id: "video-1",
  title: "热门视频",
  coverUrl: null,
  duration: 60,
  views: 10,
  createdAt: "2026-05-22T00:00:00.000Z",
  uploader: baseUser,
  extraInfo: null,
  tags: [],
  isNsfw: false,
  _count: { likes: 1, dislikes: 0, comments: 0 },
};

const image = {
  id: "image-1",
  title: "热门图集",
  description: "图集描述",
  images: ["/mixed-cover.jpg", "/mixed-side.jpg"],
  views: 20,
  isNsfw: false,
  createdAt: "2026-05-22T00:00:00.000Z",
  uploader: baseUser,
  tags: [],
};

const game = {
  id: "game-1",
  title: "热门游戏",
  description: "游戏描述",
  coverUrl: null,
  gameType: "ADV",
  isFree: true,
  version: null,
  views: 30,
  isNsfw: false,
  createdAt: "2026-05-22T00:00:00.000Z",
  extraInfo: null,
  uploader: baseUser,
  tags: [],
  _count: { likes: 1, dislikes: 0, favorites: 0 },
};

describe("CompositeMixedHot", () => {
  it("综合热门中的图片卡片使用普通封面样式", async () => {
    const { CompositeMixedHot } = await import("./composite-mixed-hot");

    const html = renderToStaticMarkup(
      <CompositeMixedHot skip={0} perKind={1} videos={[video]} images={[image]} games={[game]} />,
    );

    expect(html).toContain("综合热门");
    expect(html).toContain('data-kind="video"');
    expect(html).toContain('data-kind="game"');
    expect(html).toContain('href="/image/image-1"');
    expect(html).toContain("aspect-video");
    expect(html).toContain('src="/mixed-cover.jpg?preset=gridPrimary"');
    expect(html).not.toContain("/mixed-side.jpg");
    expect(html).not.toContain("aspect-square");
    expect(html).not.toContain("pr-2.5");
    expect(html).not.toContain("rotate-[");
    expect(html).not.toContain("translate-x");
  });
});
