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
  HoverFavoriteButton: ({ favorited }: { favorited: boolean }) => (
    <button type="button" data-testid="favorite" data-favorited={favorited} />
  ),
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

const basePost = {
  id: "image-1",
  title: "测试图集",
  description: "图集描述",
  images: ["/cover-a.jpg", "/side-b.jpg", "/side-c.jpg"],
  views: 1200,
  isNsfw: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  uploader: {
    id: "user-1",
    username: "uploader",
    nickname: "画师",
    avatar: null,
  },
  tags: [],
};

describe("ImagePostCard", () => {
  it("默认多图卡片使用普通 16:9 封面，不渲染堆叠副图", async () => {
    const { ImagePostCard } = await import("./image-post-card");

    const html = renderToStaticMarkup(<ImagePostCard post={basePost} rank={2} isFavorited />);

    expect(html).toContain("aspect-video");
    expect(html).toContain("overflow-hidden rounded-2xl bg-muted");
    expect(html).toContain('src="/cover-a.jpg?preset=gridPrimary"');
    expect(html).not.toContain("/side-b.jpg");
    expect(html).not.toContain("/side-c.jpg");
    expect(html).not.toContain("aspect-square");
    expect(html).not.toContain("pr-2.5");
    expect(html).not.toContain("pb-1");
    expect(html).not.toContain("rotate-[");
    expect(html).not.toContain("translate-x");
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain("测试图集");
    expect(html).toContain("图集描述");
    expect(html).toContain("画师");
    expect(html).toContain("NSFW");
    expect(html).toContain("absolute right-1.5 bg-black/75");
    expect(html).toContain('aria-label="排名第 2"');
    expect(html).toContain('data-favorited="true"');
  });

  it("单图默认卡片不显示多图数量徽章", async () => {
    const { ImagePostCard } = await import("./image-post-card");

    const html = renderToStaticMarkup(
      <ImagePostCard post={{ ...basePost, images: ["/only.jpg"], isNsfw: false }} />,
    );

    expect(html).toContain("aspect-video");
    expect(html).toContain('src="/only.jpg?preset=gridPrimary"');
    expect(html).not.toContain("absolute right-1.5 bg-black/75");
    expect(html.match(/<img /g)).toHaveLength(1);
  });

  it("空图片默认卡片保持封面占位不塌陷", async () => {
    const { ImagePostCard } = await import("./image-post-card");

    const html = renderToStaticMarkup(<ImagePostCard post={{ ...basePost, images: [] }} />);

    expect(html).toContain("aspect-video");
    expect(html.match(/<img /g)).toBeNull();
    expect(html).toContain("测试图集");
  });

  it("masonry variant 保留瀑布流比例容器", async () => {
    const { ImagePostCard } = await import("./image-post-card");

    const html = renderToStaticMarkup(<ImagePostCard post={basePost} variant="masonry" />);

    expect(html).toContain("aspect-ratio:0.75");
    expect(html).toContain('src="/cover-a.jpg?preset=gridPrimary&amp;h=0"');
    expect(html).not.toContain("aspect-video");
    expect(html).not.toContain("/side-b.jpg");
    expect(html).not.toContain("/side-c.jpg");
  });
});
