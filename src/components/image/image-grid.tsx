"use client";

import { ImagePostCard } from "./image-post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAdGrid } from "@/components/ads/inline-ad-grid";

interface ImagePost {
  id: string;
  title: string;
  description?: string | null;
  images: unknown;
  views: number;
  isNsfw?: boolean;
  createdAt: Date | string;
  publishedAt?: Date | string | null;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  tags?: { tag: { id: string; name: string; slug: string } }[];
}

interface ImageGridProps {
  posts: ImagePost[];
  isLoading?: boolean;
  columns?: 2 | 3 | 4 | 5;
  /** 自定义栅格 class，优先级高于 columns */
  columnsClass?: string;
  highlightQuery?: string | null;
  /** 当前用户已收藏的图集 ID 集合 */
  favoritedSet?: Set<string>;
  /** 排行榜场景：从第一项起的起始排名 */
  startRank?: number;
  /**
   * 信息流广告种子。传入即在网格中插入随机广告（典型：`${page}-${filters}`）。
   * 缺省则不插广告。
   */
  adSeed?: string;
}

const gridColumns = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
};

/**
 * 图集网格（默认 variant）：与 VideoGrid / GameGrid 风格一致，
 * 不同于首页 `/image` 的瀑布流。可选 `adSeed` 启用信息流广告。
 */
export function ImageGrid({
  posts,
  isLoading,
  columns = 4,
  columnsClass,
  highlightQuery,
  favoritedSet,
  startRank,
  adSeed,
}: ImageGridProps) {
  const colsCls = columnsClass ?? gridColumns[columns];

  if (isLoading) {
    return (
      <div className={`grid ${colsCls} gap-3 sm:gap-4 lg:gap-5`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <ImagePostCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">暂无图集</p>
      </div>
    );
  }

  if (adSeed) {
    return (
      <InlineAdGrid<ImagePost>
        items={posts}
        adSeed={adSeed}
        columnsClass={colsCls}
        renderItem={(post, index) => (
          <ImagePostCard
            key={post.id}
            post={post}
            index={index}
            highlightQuery={highlightQuery}
            isFavorited={favoritedSet?.has(post.id)}
            rank={startRank !== undefined ? startRank + index : undefined}
          />
        )}
      />
    );
  }

  return (
    <div className={`grid ${colsCls} gap-3 sm:gap-4 lg:gap-5`}>
      {posts.map((post, index) => (
        <ImagePostCard
          key={post.id}
          post={post}
          index={index}
          highlightQuery={highlightQuery}
          isFavorited={favoritedSet?.has(post.id)}
          rank={startRank !== undefined ? startRank + index : undefined}
        />
      ))}
    </div>
  );
}

function ImagePostCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-video rounded-2xl" />
      <div className="px-0.5 space-y-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
