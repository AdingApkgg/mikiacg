"use client";

import { memo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Images, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatViews } from "@/lib/format";
import { useSound } from "@/hooks/use-sound";
import { SearchHighlightText } from "@/components/shared/search-highlight-text";
import { CardMeta } from "@/components/shared/card-meta";
import { NewBadge, RankBadge } from "@/components/shared/card-badges";
import { HoverFavoriteButton } from "@/components/shared/hover-favorite-button";
import { MediaCoverSkeleton } from "@/components/shared/media-cover-skeleton";
import { useThumb } from "@/hooks/use-thumb";
import { useInViewOnce } from "@/hooks/use-in-view-once";
import { getCachedAspect, setCachedAspect } from "@/hooks/use-image-aspect-cache";
import { trpc } from "@/lib/trpc";

// 瀑布流默认占位比例：3:4 偏竖图，多数插画/海报为竖向，平均偏差最小
const DEFAULT_ASPECT_RATIO = 3 / 4;

interface ImagePostCardProps {
  post: {
    id: string;
    title: string;
    description?: string | null;
    images: unknown;
    views: number;
    isNsfw?: boolean;
    createdAt: Date | string;
    uploader: {
      id: string;
      username: string;
      nickname?: string | null;
      avatar?: string | null;
    };
    tags?: { tag: { id: string; name: string; slug: string } }[];
  };
  index?: number;
  highlightQuery?: string | null;
  /** 排行榜场景：1/2/3 显示金/银/铜冠 */
  rank?: number;
  /** 当前用户是否已收藏 */
  isFavorited?: boolean;
  /**
   * 显式控制首屏优先加载。不传则按 `index < 2` 兜底。
   * 多 section 场景（如 /image 首页）应只让真正的首屏首行传 true，
   * 避免多个 section 各自前多张都抢 fetchpriority=high 导致网络拥塞。
   */
  priority?: boolean;
  /**
   * `square`：默认网格卡片，使用普通 16:9 扁平封面（历史命名保留兼容）
   * `masonry`：保留图片原始宽高比，适合 `/image` 瀑布流首页
   */
  variant?: "square" | "masonry";
}

function ImagePostMainThumb({ src, alt, priority }: { src: string; alt: string; priority: boolean }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded && <MediaCoverSkeleton className="z-[1]" />}
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        unoptimized
        className="z-[2] object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

function ImagePostCardComponent({
  post,
  index,
  highlightQuery,
  rank,
  isFavorited,
  priority: priorityProp,
  variant = "square",
}: ImagePostCardProps) {
  const thumbPrimary = useThumb("gridPrimary");
  const { play } = useSound();
  // 优先用调用方显式传入的 priority；否则按 `index < 2` 兜底。
  // 之前是 `< 4`，但综合首页同时渲染视频/图集多个 section，每个 section 前 N 张都抢
  // priority 会触发 next/image 自动 preload 十几张图，挤占 LCP 候选的带宽。
  // 真正需要更大范围 priority 的 section 由父组件显式传 priorityProp 控制。
  const priority = priorityProp ?? (index !== undefined && index < 2);
  const { ref: viewportRef, inView } = useInViewOnce<HTMLDivElement>({ disabled: priority });

  const imageUrls = (post.images ?? []) as string[];
  const imageCount = imageUrls.length;
  const showMain = inView || priority;
  const mainSrcKey = `${post.id}:${imageUrls[0] ?? ""}`;
  const isMasonry = variant === "masonry";

  const overlays = (
    <>
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* 排行榜徽章 / NEW 徽章（左上角，二选一）*/}
      {rank !== undefined ? <RankBadge rank={rank} /> : <NewBadge createdAt={post.createdAt} />}

      {post.isNsfw && (
        <div className="absolute top-1.5 right-1.5 bg-red-500/90 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-bold">
          NSFW
        </div>
      )}

      {imageCount > 1 && (
        <div
          className={cn(
            "absolute right-1.5 bg-black/75 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1",
            post.isNsfw ? "top-9" : "top-1.5",
          )}
        >
          <Images className="h-3 w-3" />
          {imageCount}
        </div>
      )}

      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 text-[10px] sm:text-xs text-white/80">
        <Eye className="h-3 w-3" />
        {formatViews(post.views)}
      </div>

      {/* 浮动快捷收藏（hover 浮出，desktop only） */}
      <ImagePostFavoriteFab postId={post.id} isFavorited={isFavorited ?? false} />
    </>
  );

  return (
    <div ref={viewportRef} className="group" onMouseEnter={() => play("hover")}>
      <Link href={`/image/${post.id}`} className="block">
        {isMasonry ? (
          <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300 ease-out border border-transparent group-hover:border-border/20">
            {imageUrls.length > 0 ? (
              showMain ? (
                <ImagePostMasonryThumb
                  key={mainSrcKey}
                  // h=0 → sharp 端按 w 等比缩放，保留原图比例供瀑布流使用
                  src={thumbPrimary(imageUrls[0], { h: 0 })}
                  alt={post.title}
                  priority={priority}
                />
              ) : (
                // 未进入视口：用「该图缓存比例」或 3:4 默认占位
                <MasonryPlaceholder src={thumbPrimary(imageUrls[0], { h: 0 })} />
              )
            ) : (
              <div className="w-full flex items-center justify-center" style={{ aspectRatio: DEFAULT_ASPECT_RATIO }}>
                <Images className="w-12 h-12 text-muted-foreground/30" />
              </div>
            )}

            {overlays}
          </div>
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted shadow-[0_1px_2px_0_rgb(0_0_0_/_0.05)] group-hover:shadow-lg transition-shadow duration-300 ease-out">
            {imageUrls.length > 0 ? (
              showMain ? (
                <ImagePostMainThumb
                  key={mainSrcKey}
                  src={thumbPrimary(imageUrls[0])}
                  alt={post.title}
                  priority={priority}
                />
              ) : (
                <MediaCoverSkeleton className="relative z-[1] h-full w-full min-h-0" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Images className="w-12 h-12 text-muted-foreground/30" />
              </div>
            )}

            {overlays}
          </div>
        )}

        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200 ease-out">
            <SearchHighlightText text={post.title} highlightQuery={highlightQuery} />
          </h3>
          {post.description && (
            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1">
              <SearchHighlightText text={post.description} highlightQuery={highlightQuery} />
            </p>
          )}
          <CardMeta author={post.uploader.nickname || post.uploader.username} createdAt={post.createdAt} />
        </div>
      </Link>
    </div>
  );
}

/**
 * 瀑布流封面：用「缓存比例 / 默认 3:4」给容器锁定高度，img 绝对填充 + 淡入。
 * 二次进入同图时由 localStorage 提供真实比例，跳过 3:4→真实 的高度抖动。
 */
function ImagePostMasonryThumb({ src, alt, priority }: { src: string; alt: string; priority: boolean }) {
  // useState 懒初始化里直接读缓存：SSR 拿不到 window 自动 fallback 到默认值，
  // 客户端首帧若命中缓存则用真实比例，跳过 3:4→真实 的高度抖动。
  // 由此带来的 SSR/CSR 比例差异通过 suppressHydrationWarning 静默。
  const [aspectRatio, setAspectRatio] = useState<number>(() => getCachedAspect(src) ?? DEFAULT_ASPECT_RATIO);
  const [loaded, setLoaded] = useState(false);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalWidth / img.naturalHeight;
      setAspectRatio(ratio);
      setCachedAspect(src, ratio);
    }
    setLoaded(true);
  };

  return (
    <div className="relative w-full" style={{ aspectRatio }} suppressHydrationWarning>
      {!loaded && <MediaCoverSkeleton />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "low"}
        decoding="async"
        onLoad={handleLoad}
        className={cn(
          "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/**
 * 瀑布流「未进入视口」占位：以 url 命中的缓存比例锁定高度，避免懒挂载时
 * 用统一 3:4 占位 → 真实比例 的二段跳。
 */
function MasonryPlaceholder({ src }: { src: string }) {
  const aspectRatio = useState<number>(() => getCachedAspect(src) ?? DEFAULT_ASPECT_RATIO)[0];
  return (
    <div className="relative w-full" style={{ aspectRatio }} suppressHydrationWarning>
      <MediaCoverSkeleton />
    </div>
  );
}

function ImagePostFavoriteFab({ postId, isFavorited }: { postId: string; isFavorited: boolean }) {
  const utils = trpc.useUtils();
  const mutation = trpc.image.toggleFavorite.useMutation();
  return (
    <HoverFavoriteButton
      favorited={isFavorited}
      unauthCallbackUrl={`/image/${postId}`}
      onToggle={async () => {
        const data = await mutation.mutateAsync({ imagePostId: postId });
        void utils.image.favoritedMap.invalidate();
        return data.favorited;
      }}
    />
  );
}

export const ImagePostCard = memo(ImagePostCardComponent, (prev, next) => {
  return (
    prev.post.id === next.post.id &&
    prev.post.views === next.post.views &&
    prev.index === next.index &&
    prev.highlightQuery === next.highlightQuery &&
    prev.rank === next.rank &&
    prev.isFavorited === next.isFavorited &&
    prev.priority === next.priority &&
    prev.variant === next.variant
  );
});
