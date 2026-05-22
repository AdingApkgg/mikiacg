"use client";

import { trpc } from "@/lib/trpc";
import { ImagePostCard } from "@/components/image/image-post-card";
import { ImageMasonry } from "@/components/image/image-masonry";
import { AnnouncementBanner } from "@/components/shared/announcement-banner";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { usePageParam } from "@/hooks/use-page-param";
import { Images } from "lucide-react";
import { MotionPage } from "@/components/motion";
import { SectionTabs, type SectionTabItem } from "@/components/shared/section-tabs";
import { useTagFilter } from "@/hooks/use-tag-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { AdCard } from "@/components/ads/ad-card";
import { HeaderBannerCarousel } from "@/components/ads/header-banner";
import { useInlineAds } from "@/hooks/use-inline-ads";
import { useUIStore } from "@/stores/app";
import { useSiteConfig } from "@/contexts/site-config";

/** inline 广告密度：每 8 条插入 1 条 */
const AD_DENSITY = 8;

// 骨架屏伪随机高度（基于 index 稳定），让瀑布流更接近真实图片节奏
const SKELETON_RATIOS = ["3 / 4", "4 / 5", "1 / 1", "2 / 3", "5 / 7", "4 / 3"];

type SortBy = "latest" | "views" | "likes" | "titleAsc" | "titleDesc";
const DEFAULT_IMAGE_SORT_OPTIONS = "latest,views,likes";

const ALL_SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "latest", label: "最新" },
  { id: "views", label: "热门" },
  { id: "likes", label: "高赞" },
  { id: "titleAsc", label: "标题 A→Z" },
  { id: "titleDesc", label: "标题 Z→A" },
];

interface ImagePost {
  id: string;
  title: string;
  description?: string | null;
  images: string[];
  views: number;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  tags?: { tag: { id: string; name: string; slug: string } }[];
}

interface ImageListClientProps {
  initialPosts: ImagePost[];
  initialSortBy?: string;
}

function getEnabledSortOptions(rawOptions: string | null | undefined): SortBy[] {
  const normalized = rawOptions?.trim();
  const options = normalized || DEFAULT_IMAGE_SORT_OPTIONS;
  return options
    .split(",")
    .map((s) => s.trim())
    .filter((id): id is SortBy => ALL_SORT_OPTIONS.some((opt) => opt.id === id));
}

export function ImageListClient({ initialPosts, initialSortBy }: ImageListClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);
  const siteConfigCtx = useSiteConfig();
  const searchParams = useSearchParams();

  useEffect(() => {
    setContentMode("image");
  }, [setContentMode]);

  // URL ?sortBy 优先级最高（来自首页 section "查看更多" 链接）
  const urlSortBy = searchParams.get("sortBy") as SortBy | null;
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const enabled = getEnabledSortOptions(siteConfigCtx?.imageSortOptions);
    if (urlSortBy && enabled.includes(urlSortBy)) return urlSortBy;
    const configured = (siteConfigCtx?.imageDefaultSort as SortBy) || "latest";
    return enabled.includes(configured) ? configured : ((enabled[0] as SortBy) ?? "latest");
  });
  // 时间范围筛选（仅 URL ?timeRange 驱动）
  const urlTimeRangeRaw = searchParams.get("timeRange");
  const urlTimeRange = (urlTimeRangeRaw as "all" | "today" | "week" | "month" | null) ?? "all";
  const timeRange: "all" | "today" | "week" | "month" = ["all", "today", "week", "month"].includes(urlTimeRange)
    ? urlTimeRange
    : "all";
  const { selectedSlugs, excludedSlugs, clearAll, hasFilter } = useTagFilter();
  const [page, setPage] = usePageParam();

  // 不再使用 placeholderData：翻页 / 切换排序 / 切换筛选时立即清空旧内容 → 显示骨架屏，
  // 避免用户以为「页面没反应」，也能让浏览器尽快释放旧图片请求、开始加载新页
  const {
    data: postData,
    isLoading,
    isFetching,
  } = trpc.image.list.useQuery({
    limit: 20,
    page,
    sortBy,
    tagSlugs: selectedSlugs.length > 0 ? selectedSlugs : undefined,
    excludeTagSlugs: excludedSlugs.length > 0 ? excludedSlugs : undefined,
    timeRange,
  });

  const canUseInitialPosts =
    page === 1 &&
    !hasFilter &&
    timeRange === "all" &&
    sortBy === (initialSortBy ?? siteConfigCtx?.imageDefaultSort ?? "latest");

  const posts = useMemo(
    () => postData?.posts ?? (canUseInitialPosts && isLoading ? initialPosts : []),
    [postData?.posts, canUseInitialPosts, initialPosts, isLoading],
  );
  const totalPages = postData?.totalPages ?? 1;
  const showSkeleton = (isLoading || isFetching) && posts.length === 0;

  // 当前页图集的收藏状态（已登录才查；未登录返回空）
  const imagePostIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const { data: favoritedData } = trpc.image.favoritedMap.useQuery(
    { imagePostIds },
    { enabled: imagePostIds.length > 0, staleTime: 30_000 },
  );
  const favoritedSet = useMemo(() => new Set(favoritedData?.favoritedIds ?? []), [favoritedData?.favoritedIds]);

  const handlePageChange = useCallback(
    (next: number) => {
      setPage(next);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [setPage],
  );

  const adSeed = `image-${page}-${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { gridItems, pickedAds, hasAds } = useInlineAds<any>({
    items: posts,
    seed: adSeed,
    count: 4,
    interval: AD_DENSITY,
  });

  const sortOptions = useMemo(() => {
    const enabledKeys = getEnabledSortOptions(siteConfigCtx?.imageSortOptions);
    return ALL_SORT_OPTIONS.filter((opt) => enabledKeys.includes(opt.id));
  }, [siteConfigCtx?.imageSortOptions]);

  // 瀑布流 items 数组用 memo 锁定引用，避免父组件每次 re-render 都让 ImageMasonry 的列分配失效
  const skeletonItems = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        key: `skel-${i}`,
        node: (
          <div className="space-y-2">
            <Skeleton
              className="w-full rounded-2xl"
              style={{ aspectRatio: SKELETON_RATIOS[i % SKELETON_RATIOS.length] }}
            />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ),
      })),
    [],
  );

  const adGridItems = useMemo(
    () =>
      gridItems.map((item, index) =>
        item.type === "ad"
          ? {
              key: `ad-${item.adIndex}`,
              node: <AdCard ad={pickedAds[item.adIndex]} slotId="in-feed" />,
            }
          : {
              key: item.data.id,
              node: (
                <ImagePostCard
                  post={item.data}
                  index={index}
                  isFavorited={favoritedSet.has(item.data.id)}
                  variant="masonry"
                />
              ),
            },
      ),
    [gridItems, pickedAds, favoritedSet],
  );

  const postItems = useMemo(
    () =>
      posts.map((post, index) => ({
        key: post.id,
        node: <ImagePostCard post={post} index={index} isFavorited={favoritedSet.has(post.id)} variant="masonry" />,
      })),
    [posts, favoritedSet],
  );

  return (
    <MotionPage direction="none">
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        <HeaderBannerCarousel className="mb-4" />
        <AnnouncementBanner
          enabled={siteConfigCtx?.announcementEnabled ?? false}
          announcement={siteConfigCtx?.announcement ?? null}
        />
        <MotionPage>
          {sortOptions.length > 0 && (
            <SectionTabs<SortBy>
              className="mb-3"
              tabs={sortOptions as SectionTabItem<SortBy>[]}
              value={sortBy}
              onChange={(id) => {
                setSortBy(id);
                setPage(1);
              }}
            />
          )}
        </MotionPage>
        <section>
          <div key={`${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}-${page}`}>
            {showSkeleton ? (
              <ImageMasonry items={skeletonItems} />
            ) : hasAds ? (
              <ImageMasonry items={adGridItems} />
            ) : (
              <ImageMasonry items={postItems} />
            )}

            {!isLoading && !isFetching && posts.length === 0 && (
              <div className="text-center py-16">
                <div className="text-muted-foreground mb-4">
                  <Images className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">没有找到图片</p>
                  <p className="text-sm mt-1">{hasFilter ? "尝试调整标签筛选条件" : "暂无图片内容"}</p>
                </div>
                {hasFilter && (
                  <Button variant="outline" onClick={clearAll} className="mt-4">
                    清除筛选
                  </Button>
                )}
              </div>
            )}
          </div>

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={handlePageChange} className="mt-8" />
        </section>
      </div>
    </MotionPage>
  );
}
