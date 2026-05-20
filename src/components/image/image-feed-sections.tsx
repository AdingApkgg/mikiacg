"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Flame, Trophy } from "lucide-react";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { ImagePostCard } from "./image-post-card";
import { ImageMasonry } from "./image-masonry";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 图片帖子列表「首页模式」：参考视频区，多个 Section 上下排列。
 * 仅在用户首次进 /image 且无任何筛选时展示。
 */

type SortBy = "latest" | "views" | "likes" | "titleAsc" | "titleDesc";
type TimeRange = "all" | "today" | "week" | "month";

interface SectionDef {
  id: string;
  title: string;
  Icon: typeof Sparkles;
  iconClass: string;
  sortBy: SortBy;
  timeRange?: TimeRange;
  moreParams: string;
  showRank?: boolean;
}

// 三种差异化排序，避免时间窗口空数据
const SECTIONS: SectionDef[] = [
  {
    id: "latest",
    title: "最新发布",
    Icon: Sparkles,
    iconClass: "text-sky-500",
    sortBy: "latest",
    moreParams: "?sortBy=latest",
  },
  {
    id: "trending",
    title: "热门图集",
    Icon: Flame,
    iconClass: "text-orange-500",
    sortBy: "views",
    moreParams: "?sortBy=views",
  },
  {
    id: "top-rated",
    title: "高赞排行",
    Icon: Trophy,
    iconClass: "text-amber-500",
    sortBy: "likes",
    moreParams: "?sortBy=likes",
    showRank: true,
  },
];

interface ImageFeedSectionsProps {
  className?: string;
  perSection?: number;
}

export function ImageFeedSections({ className, perSection = 8 }: ImageFeedSectionsProps) {
  return (
    <div className={cn("space-y-10", className)}>
      {SECTIONS.map((section, idx) => (
        // 仅第一个 section 的前 4 张走高优先级，避免 3 个 section 同时各抢 4 张
        // priority（共 12 张并发抢 fetchpriority=high）导致网络拥塞、下半屏图等更久。
        <FeedSection key={section.id} section={section} limit={perSection} eagerFirstRow={idx === 0} />
      ))}
    </div>
  );
}

function FeedSection({
  section,
  limit,
  eagerFirstRow,
}: {
  section: SectionDef;
  limit: number;
  eagerFirstRow: boolean;
}) {
  const { data, isLoading } = trpc.image.list.useQuery(
    { limit, page: 1, sortBy: section.sortBy, timeRange: section.timeRange ?? "all" },
    { staleTime: 60_000 },
  );
  const posts = useMemo(() => data?.posts ?? [], [data?.posts]);
  const imagePostIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const { data: favoritedData } = trpc.image.favoritedMap.useQuery(
    { imagePostIds },
    { enabled: imagePostIds.length > 0, staleTime: 30_000 },
  );
  const favoritedSet = useMemo(() => new Set(favoritedData?.favoritedIds ?? []), [favoritedData?.favoritedIds]);

  const skeletonItems = useMemo(
    () =>
      Array.from({ length: limit }).map((_, i) => ({
        key: `skel-${i}`,
        node: <SectionCardSkeleton index={i} />,
      })),
    [limit],
  );

  const postItems = useMemo(
    () =>
      posts.map((p, i) => ({
        key: p.id,
        node: (
          <ImagePostCard
            post={p}
            index={i}
            priority={eagerFirstRow && i < 4}
            rank={section.showRank ? i + 1 : undefined}
            isFavorited={favoritedSet.has(p.id)}
            variant="masonry"
          />
        ),
      })),
    [posts, eagerFirstRow, section.showRank, favoritedSet],
  );

  const { Icon } = section;

  return (
    <section>
      <header className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", section.iconClass)} />
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{section.title}</h2>
        </div>
        <Link
          href={`/image${section.moreParams}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          查看更多
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {isLoading && posts.length === 0 ? (
        <ImageMasonry items={skeletonItems} />
      ) : posts.length > 0 ? (
        <ImageMasonry items={postItems} />
      ) : (
        <div className="text-sm text-muted-foreground py-8 text-center">暂无内容</div>
      )}
    </section>
  );
}

// 骨架屏在瀑布流里走伪随机高度（基于 index 稳定），避免每次渲染都跳动
const SKELETON_RATIOS = ["3 / 4", "4 / 5", "1 / 1", "2 / 3", "5 / 7", "4 / 3"];

function SectionCardSkeleton({ index }: { index: number }) {
  const ratio = SKELETON_RATIOS[index % SKELETON_RATIOS.length];
  return (
    <div className="space-y-2">
      <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: ratio }} />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
