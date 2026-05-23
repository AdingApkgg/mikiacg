"use client";

import { VideoCard } from "./video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { MotionList, MotionItem } from "@/components/motion";

interface Video {
  id: string;
  title: string;
  coverUrl?: string | null;
  coverBlurHash?: string | null;
  duration?: number | null;
  views: number;
  createdAt: Date | string;
  publishedAt?: Date | string | null;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraInfo?: any;
  tags?: { tag: { id: string; name: string; slug: string } }[];
  _count: {
    likes: number;
    dislikes?: number;
    [key: string]: number | undefined;
  };
}

interface VideoGridProps {
  videos: Video[];
  isLoading?: boolean;
  columns?: 2 | 3 | 4 | 5;
  /** 自定义栅格 class，优先级高于 columns */
  columnsClass?: string;
  highlightQuery?: string | null;
  /** 当前用户对每个视频的观看进度（来自 video.progressMap）。Key 为 videoId */
  progressMap?: Record<string, { progress: number; duration: number | null }>;
  /** 排行榜场景：从第一项起的起始排名（首页排行 section 通常 1） */
  startRank?: number;
  /** 当前用户已收藏的视频 ID 集合（来自 video.favoritedMap） */
  favoritedSet?: Set<string>;
}

const gridColumns = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
};

export function VideoGrid({
  videos,
  isLoading,
  columns = 4,
  columnsClass,
  highlightQuery,
  progressMap,
  startRank,
  favoritedSet,
}: VideoGridProps) {
  const colsCls = columnsClass ?? gridColumns[columns];

  if (isLoading) {
    return (
      <div className={`grid ${colsCls} gap-3 sm:gap-4 lg:gap-5`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">暂无视频</p>
      </div>
    );
  }

  return (
    <MotionList className={`grid ${colsCls} gap-3 sm:gap-4 lg:gap-5`}>
      {videos.map((video, index) => (
        <MotionItem key={video.id}>
          <VideoCard
            video={video}
            index={index}
            highlightQuery={highlightQuery}
            watchProgress={progressMap?.[video.id]}
            rank={startRank !== undefined ? startRank + index : undefined}
            isFavorited={favoritedSet?.has(video.id)}
          />
        </MotionItem>
      ))}
    </MotionList>
  );
}

function VideoCardSkeleton() {
  return (
    <div className="space-y-2">
      <div className="relative aspect-video rounded-lg overflow-hidden">
        <Skeleton className="absolute inset-0" />
        <div className="absolute top-1.5 left-1.5">
          <Skeleton className="h-4 w-10 rounded" />
        </div>
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between">
          <Skeleton className="h-4 w-12 rounded bg-white/10" />
          <Skeleton className="h-4 w-10 rounded bg-white/10" />
        </div>
      </div>
      <div className="px-0.5 space-y-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
