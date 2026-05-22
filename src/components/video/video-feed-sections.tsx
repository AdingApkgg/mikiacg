"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Flame, Trophy, Crown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "./video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 视频列表「首页模式」分区 Feed —— 多个 section 上下排列，每个 section 用不同 layout：
 * - 「最新发布」4 列网格（最多 8 张，桌面优先 4 × 2）
 * - 「本日热门」标准 4 列网格
 * - 「本周排行」Top 1 hero（冠军大图 + 6 张其他）
 *
 * 参考 hanime1.me 的 section 设计。
 */

type SortBy = "latest" | "views" | "likes" | "titleAsc" | "titleDesc";
type TimeRange = "all" | "today" | "week" | "month";
type Layout = "grid" | "hero";

interface SectionDef {
  id: string;
  title: string;
  Icon: typeof Sparkles;
  iconClass: string;
  sortBy: SortBy;
  timeRange?: TimeRange;
  moreParams: string;
  layout: Layout;
  /** 是否对前 N 名展示金/银/铜冠 */
  showRank?: boolean;
}

// 用三种不同的排序维度差异化 section，而不是用时间窗口切割
// (时间窗口在新发布内容少的站点会让 section 直接空掉)：
//   - 最新发布: createdAt desc
//   - 热门视频: views desc (历史累计播放量)
//   - 高赞作品: likes count desc
const SECTIONS: SectionDef[] = [
  {
    id: "latest",
    title: "最新发布",
    Icon: Sparkles,
    iconClass: "text-sky-500",
    sortBy: "latest",
    moreParams: "?sortBy=latest",
    layout: "grid",
  },
  {
    id: "trending",
    title: "热门视频",
    Icon: Flame,
    iconClass: "text-orange-500",
    sortBy: "views",
    moreParams: "?sortBy=views",
    layout: "grid",
  },
  {
    id: "top-rated",
    title: "高赞排行",
    Icon: Trophy,
    iconClass: "text-amber-500",
    sortBy: "likes",
    moreParams: "?sortBy=likes",
    layout: "hero",
    showRank: true,
  },
];

interface VideoFeedSectionsProps {
  className?: string;
}

export function VideoFeedSections({ className }: VideoFeedSectionsProps) {
  return (
    <div className={cn("space-y-10", className)}>
      <FeedSection section={SECTIONS[0]} />
      <FeedSection section={SECTIONS[1]} />
      <FeedSection section={SECTIONS[2]} />
    </div>
  );
}

function FeedSection({ section }: { section: SectionDef }) {
  // 不同 layout 拉的数量不一样：
  // - grid 拉 8 张（4 列 × 2 行）
  // - hero 拉 7 张（冠军大图 1 + 网格 6）
  const limit = section.layout === "hero" ? 7 : 8;

  const { data, isLoading } = trpc.video.list.useQuery(
    { limit, page: 1, sortBy: section.sortBy, timeRange: section.timeRange ?? "all" },
    { staleTime: 60_000 },
  );
  const videos = data?.videos ?? [];
  const videoIds = videos.map((v) => v.id);
  const { data: progressData } = trpc.video.progressMap.useQuery(
    { videoIds },
    { enabled: videoIds.length > 0, staleTime: 30_000 },
  );
  const progressMap = progressData?.progressByVideoId;
  const { data: favoritedData } = trpc.video.favoritedMap.useQuery(
    { videoIds },
    { enabled: videoIds.length > 0, staleTime: 30_000 },
  );
  const favoritedSet = new Set(favoritedData?.favoritedIds ?? []);

  return (
    <section>
      <SectionHeader section={section} />

      {isLoading && videos.length === 0 ? (
        <SectionSkeleton layout={section.layout} count={limit} />
      ) : videos.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">暂无内容</div>
      ) : section.layout === "hero" ? (
        <HeroLayout videos={videos} progressMap={progressMap} favoritedSet={favoritedSet} showRank={section.showRank} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          {videos.map((v, i) => (
            <VideoCard
              key={v.id}
              video={v}
              index={i}
              watchProgress={progressMap?.[v.id]}
              rank={section.showRank ? i + 1 : undefined}
              isFavorited={favoritedSet.has(v.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Section 标题栏：图标 + 标题 + 「查看更多」链接 */
function SectionHeader({ section }: { section: SectionDef }) {
  const { Icon } = section;
  return (
    <header className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-5 w-5", section.iconClass)} />
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{section.title}</h2>
      </div>
      <Link
        href={`/video${section.moreParams}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        查看更多
        <ArrowRight className="h-4 w-4" />
      </Link>
    </header>
  );
}

/**
 * Hero Layout：冠军大图占左侧 2 列高度，右侧 6 张普通卡片。
 * 移动端退化为普通网格，避免横向不够宽时大图过宽。
 */
type VideoCardItem = React.ComponentProps<typeof VideoCard>["video"];

function HeroLayout({
  videos,
  progressMap,
  favoritedSet,
  showRank,
}: {
  videos: VideoCardItem[];
  progressMap?: Record<string, { progress: number; duration: number | null }>;
  favoritedSet: Set<string>;
  showRank?: boolean;
}) {
  if (videos.length === 0) return null;
  const [champion, ...rest] = videos;

  return (
    <div className="grid gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-3">
      {/* 冠军大封面：lg+ 上跨两列两行；移动端正常单卡 */}
      <div className="lg:col-span-2 lg:row-span-2 relative">
        <VideoCard
          video={champion}
          index={0}
          watchProgress={progressMap?.[champion.id]}
          rank={showRank ? 1 : undefined}
          isFavorited={favoritedSet.has(champion.id)}
        />
        {/* 冠军徽章覆盖在大封面上（除了卡片自身的 RankBadge） */}
        <div className="hidden lg:flex absolute top-3 right-3 z-[2] items-center gap-1.5 rounded-full bg-amber-500 text-amber-50 px-3 py-1 text-sm font-bold shadow-xl">
          <Crown className="h-4 w-4" />
          冠军
        </div>
      </div>

      {/* 右侧 6 张普通卡片，2x3 网格（lg+） */}
      <div className="contents lg:grid lg:grid-cols-2 lg:gap-3">
        {rest.map((v, i) => (
          <VideoCard
            key={v.id}
            video={v}
            index={i + 1}
            watchProgress={progressMap?.[v.id]}
            rank={showRank ? i + 2 : undefined}
            isFavorited={favoritedSet.has(v.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Section 加载骨架 */
function SectionSkeleton({ layout, count }: { layout: Layout; count: number }) {
  if (layout === "hero") {
    return (
      <div className="grid gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 lg:row-span-2 space-y-2">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="contents lg:grid lg:grid-cols-2 lg:gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full rounded-2xl" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
