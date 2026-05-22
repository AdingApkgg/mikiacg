"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { VideoCard } from "@/components/video/video-card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { usePageParam } from "@/hooks/use-page-param";
import { X, Play, User2, Layers } from "lucide-react";
import { MotionPage } from "@/components/motion";
import { cn } from "@/lib/utils";
import { AnnouncementBanner } from "@/components/shared/announcement-banner";
import { SectionTabs, type SectionTabItem } from "@/components/shared/section-tabs";
import { useTagFilter } from "@/hooks/use-tag-filter";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { useVideoCoverThumb } from "@/hooks/use-thumb";
import { AdCard } from "@/components/ads/ad-card";
import { HeaderBannerCarousel } from "@/components/ads/header-banner";
import { useInlineAds } from "@/hooks/use-inline-ads";
import type { Ad } from "@/lib/ads";
import { useUIStore } from "@/stores/app";
import { useSiteConfig } from "@/contexts/site-config";

/** 分区页主网格固定列数：移动 2 / lg 3 / xl 4 */
const SECTION_GRID_CLASS = "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
/** inline 广告密度：每 8 条插入 1 条 */
const AD_DENSITY = 8;

type ViewMode = "videos" | "authors";
type SortBy = "latest" | "views" | "likes" | "titleAsc" | "titleDesc";

const ALL_SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "latest", label: "最新" },
  { id: "views", label: "热门" },
  { id: "likes", label: "高赞" },
  { id: "titleAsc", label: "标题 A→Z" },
  { id: "titleDesc", label: "标题 Z→A" },
];

interface Video {
  id: string;
  title: string;
  coverUrl: string | null;
  coverBlurHash?: string | null;
  duration: number | null;
  views: number;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
  };
  tags?: { tag: { id: string; name: string; slug: string } }[];
  _count: { likes: number; dislikes?: number; favorites?: number };
}

interface VideoListClientProps {
  initialVideos: Video[];
  initialSortBy?: string;
  siteConfig: {
    announcement: string | null;
    announcementEnabled: boolean;
  } | null;
  /** 服务端预选的广告（首页第一页 SSR 直出用） */
  initialAds?: Ad[];
}

interface VideoAuthorItem {
  author: string;
  videoCount: number;
  totalViews: number;
  previewVideos: { id: string; coverUrl: string | null; title: string }[];
}

export function VideoViewModeHeader({
  viewMode,
  viewModeOptions,
  sortOptions,
  sortBy,
  onSortChange,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  viewModeOptions: { id: ViewMode; label: string }[];
  sortOptions: SectionTabItem<SortBy>[];
  sortBy: SortBy;
  onSortChange: (id: SortBy) => void;
  onViewModeChange: (id: ViewMode) => void;
}) {
  const toggle = (
    <div data-testid="video-view-mode-toggle" className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
      {viewModeOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onViewModeChange(option.id)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium rounded-full transition-colors",
            viewMode === option.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (viewMode === "videos" && sortOptions.length > 0) {
    return (
      <SectionTabs<SortBy>
        className="mb-3"
        tabs={sortOptions}
        value={sortBy}
        onChange={onSortChange}
        trailing={toggle}
      />
    );
  }

  return (
    <div
      data-testid="video-view-mode-header"
      className="mb-3 flex items-end justify-end border-b border-border/60 pb-1.5"
    >
      {toggle}
    </div>
  );
}

export default function VideoListClient({
  initialVideos,
  initialSortBy,
  siteConfig,
  initialAds = [],
}: VideoListClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);
  const siteConfigCtx = useSiteConfig();
  const sideListCover = useVideoCoverThumb("sideList");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL ?author=xxx 用作"按原作者筛选"，由作者卡片点击时设置
  const authorFilter = searchParams.get("author") || "";

  // 记录用户访问了视频区
  useEffect(() => {
    setContentMode("video");
  }, [setContentMode]);

  const [viewMode, setViewMode] = useState<ViewMode>("videos");
  // URL ?sortBy 优先级最高（来自首页 section "查看更多" 链接），其次站点默认
  const urlSortBy = searchParams.get("sortBy") as SortBy | null;
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const enabled = (siteConfigCtx?.videoSortOptions ?? "latest,views,likes").split(",").map((s) => s.trim());
    if (urlSortBy && enabled.includes(urlSortBy)) return urlSortBy;
    const configured = (siteConfigCtx?.videoDefaultSort as SortBy) || "latest";
    return enabled.includes(configured) ? configured : ((enabled[0] as SortBy) ?? "latest");
  });
  // 时间范围筛选（仅 list 用，无 UI 控件，仅由 ?timeRange URL 参数驱动）
  const urlTimeRangeRaw = searchParams.get("timeRange");
  const urlTimeRange = (urlTimeRangeRaw as "all" | "today" | "week" | "month" | null) ?? "all";
  const timeRange: "all" | "today" | "week" | "month" = ["all", "today", "week", "month"].includes(urlTimeRange)
    ? urlTimeRange
    : "all";
  const { selectedSlugs, excludedSlugs, clearAll, hasFilter } = useTagFilter();
  const [videoPage, setVideoPage] = usePageParam("page");
  const [authorsPage, setAuthorsPage] = usePageParam("ap");

  const {
    data: videoData,
    isLoading: videoLoading,
    isFetching: videoFetching,
    isPlaceholderData: videoPlaceholderData = false,
  } = trpc.video.list.useQuery(
    {
      limit: 20,
      page: videoPage,
      sortBy,
      tagSlugs: selectedSlugs.length > 0 ? selectedSlugs : undefined,
      excludeTagSlugs: excludedSlugs.length > 0 ? excludedSlugs : undefined,
      author: authorFilter || undefined,
      timeRange,
    },
    {
      enabled: viewMode === "videos",
    },
  );

  // 原作者聚合查询：列表页"作者"tab 用，按 extraInfo.author 分组
  const { data: authorsData, isLoading: authorsLoading } = trpc.video.listAuthors.useQuery(
    { limit: 12, page: authorsPage, sortBy: "videoCount" },
    {
      enabled: viewMode === "authors",
    },
  );

  // 数据（用 useMemo 稳定引用，避免下游 useMemo 依赖在每次渲染时变化）。
  // 仅在当前列表条件与服务端首屏 initialVideos 条件一致时使用 SSR 占位，
  // 否则等待 client query 返回，避免热门/高赞页先闪出最新内容。
  const canUseInitialVideos =
    videoPage === 1 &&
    !hasFilter &&
    !authorFilter &&
    timeRange === "all" &&
    sortBy === (initialSortBy ?? siteConfigCtx?.videoDefaultSort ?? "latest");

  const currentVideoData = videoPlaceholderData ? undefined : videoData;
  const videos = useMemo(
    () => currentVideoData?.videos ?? (canUseInitialVideos ? initialVideos : []),
    [currentVideoData?.videos, canUseInitialVideos, initialVideos],
  );
  const videoTotalPages = currentVideoData?.totalPages ?? 1;
  const videoPending = videoLoading || videoFetching || videoPlaceholderData;
  const showVideoSkeleton = videoPending && videos.length === 0;
  const authorItems = authorsData?.items ?? [];
  const authorsTotalPages = authorsData?.totalPages ?? 1;

  // 当前页视频的观看进度（已登录才查；未登录返回空 map）
  const videoIds = useMemo(() => videos.map((v) => v.id), [videos]);
  const { data: progressData } = trpc.video.progressMap.useQuery(
    { videoIds },
    {
      enabled: viewMode === "videos" && videoIds.length > 0,
      staleTime: 30_000,
    },
  );
  const progressMap = progressData?.progressByVideoId;

  const { data: favoritedData } = trpc.video.favoritedMap.useQuery(
    { videoIds },
    {
      enabled: viewMode === "videos" && videoIds.length > 0,
      staleTime: 30_000,
    },
  );
  const favoritedSet = useMemo(() => new Set(favoritedData?.favoritedIds ?? []), [favoritedData?.favoritedIds]);

  const isFirstPage = videoPage === 1 && !hasFilter && !authorFilter;
  const adSeed = `${videoPage}-${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}-${authorFilter}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { gridItems, pickedAds, hasAds } = useInlineAds<any>({
    items: videos,
    seed: adSeed,
    initialAds,
    useInitialAds: isFirstPage && initialAds.length > 0,
    count: 4,
    interval: AD_DENSITY,
  });

  // 视图模式选项
  const viewModeOptions: { id: ViewMode; label: string }[] = [
    { id: "videos", label: "视频" },
    { id: "authors", label: "作者" },
  ];

  const sortOptions = useMemo(() => {
    const enabledKeys = (siteConfigCtx?.videoSortOptions ?? "latest,views,likes").split(",").map((s) => s.trim());
    return ALL_SORT_OPTIONS.filter((opt) => enabledKeys.includes(opt.id));
  }, [siteConfigCtx?.videoSortOptions]);

  const handleViewModeClick = useCallback(
    (id: ViewMode) => {
      setViewMode(id);
      if (id === "authors") {
        // 切到"作者"聚合视图时，清空 tag 筛选与 author URL 参数（避免视图错乱）
        clearAll();
        if (authorFilter) {
          const params = new URLSearchParams(window.location.search);
          params.delete("author");
          const qs = params.toString();
          router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
        }
      }
    },
    [clearAll, authorFilter, pathname, router],
  );

  /** 清除"按原作者筛选"过滤条件 */
  const handleClearAuthorFilter = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("author");
    params.delete("page");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [pathname, router]);

  const handleSortClick = useCallback(
    (id: SortBy) => {
      setSortBy(id);
      setVideoPage(1);
    },
    [setVideoPage],
  );

  return (
    <MotionPage direction="none">
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        <HeaderBannerCarousel className="mb-4" />
        <AnnouncementBanner
          enabled={siteConfig?.announcementEnabled ?? false}
          announcement={siteConfig?.announcement ?? null}
        />
        <MotionPage>
          <VideoViewModeHeader
            viewMode={viewMode}
            viewModeOptions={viewModeOptions}
            sortOptions={sortOptions as SectionTabItem<SortBy>[]}
            sortBy={sortBy}
            onSortChange={handleSortClick}
            onViewModeChange={handleViewModeClick}
          />

          {/* 当前正在按某位原作者筛选时显示横幅 */}
          {viewMode === "videos" && authorFilter && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-primary/8 border border-primary/20 px-4 py-2.5">
              <User2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate">
                正在按原作者筛选：<strong className="font-semibold">{authorFilter}</strong>
              </span>
              <button
                type="button"
                onClick={handleClearAuthorFilter}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-colors inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                清除
              </button>
            </div>
          )}
        </MotionPage>
        <section>
          {viewMode === "videos" ? (
            // 视频网格
            <>
              <div key={`${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}-${videoPage}`}>
                {showVideoSkeleton ? (
                  <VideoGrid videos={[]} isLoading columnsClass={SECTION_GRID_CLASS} />
                ) : hasAds ? (
                  <div className={cn("grid gap-3 sm:gap-4 lg:gap-5", SECTION_GRID_CLASS)}>
                    {gridItems.map((item, index) =>
                      item.type === "ad" ? (
                        <AdCard key={`ad-${item.adIndex}`} ad={pickedAds[item.adIndex]} slotId="in-feed" />
                      ) : (
                        <VideoCard
                          key={item.data.id}
                          video={item.data}
                          index={index}
                          watchProgress={progressMap?.[item.data.id]}
                          isFavorited={favoritedSet.has(item.data.id)}
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <VideoGrid
                    videos={videos}
                    isLoading={false}
                    columnsClass={SECTION_GRID_CLASS}
                    progressMap={progressMap}
                    favoritedSet={favoritedSet}
                  />
                )}

                {/* 无结果提示 */}
                {!videoPending && videos.length === 0 && (
                  <div className="text-center py-16">
                    <div className="text-muted-foreground mb-4">
                      <p className="text-lg font-medium">没有找到视频</p>
                      <p className="text-sm mt-1">{hasFilter ? "尝试调整标签筛选条件" : "暂无视频内容"}</p>
                    </div>
                    {hasFilter && (
                      <Button variant="outline" onClick={clearAll} className="mt-4">
                        清除筛选
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* 分页器 */}
              <Pagination
                currentPage={videoPage}
                totalPages={videoTotalPages}
                onPageChange={setVideoPage}
                className="mt-8"
              />
            </>
          ) : (
            // 原作者聚合网格：按 extraInfo.author 分组，点击进入该作者作品筛选
            <VideoAuthorsGrid
              items={authorItems}
              isLoading={authorsLoading}
              page={authorsPage}
              totalPages={authorsTotalPages}
              onPageChange={setAuthorsPage}
              onAuthorClick={() => setViewMode("videos")}
              coverSrc={sideListCover}
            />
          )}
        </section>
      </div>
    </MotionPage>
  );
}

export function VideoAuthorsGrid({
  items,
  isLoading,
  page,
  totalPages,
  onPageChange,
  onAuthorClick,
  coverSrc,
}: {
  items: VideoAuthorItem[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (n: number) => void;
  onAuthorClick: () => void;
  coverSrc: (videoId: string, coverUrl: string | null | undefined) => string;
}) {
  return (
    <>
      <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-4 overflow-hidden lg:grid-cols-3 xl:grid-cols-4">
        {isLoading && items.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="min-w-0 max-w-full overflow-hidden">
                <Skeleton className="aspect-video w-full" />
                <CardContent className="min-w-0 p-3 space-y-2 overflow-hidden">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))
          : items.map((a) => (
              <Link
                key={a.author}
                href={`/video?author=${encodeURIComponent(a.author)}`}
                onClick={onAuthorClick}
                className="block min-w-0 w-full max-w-full overflow-hidden"
              >
                <Card className="min-w-0 w-full max-w-full overflow-hidden group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                  <div className="relative aspect-video min-w-0 w-full max-w-full overflow-hidden bg-muted">
                    {a.previewVideos.length > 0 ? (
                      <div className="grid h-full min-w-0 w-full max-w-full grid-cols-2 grid-rows-2 overflow-hidden">
                        {[0, 1, 2, 3].map((idx) => {
                          const video = a.previewVideos[idx];
                          return (
                            <div key={idx} className="relative min-w-0 overflow-hidden">
                              {video ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={coverSrc(video.id, video.coverUrl)}
                                  alt={video.title}
                                  className="h-full w-full max-w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-muted">
                                  <Play className="w-6 h-6 text-muted-foreground/50" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <User2 className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}

                    <Badge className="absolute bottom-2 right-2 max-w-[calc(100%-1rem)] truncate bg-black/70 hover:bg-black/70 text-white">
                      {a.videoCount} 个作品
                    </Badge>

                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                      <Play className="w-12 h-12 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>

                  <CardContent className="min-w-0 w-full max-w-full overflow-hidden p-3">
                    <h3 className="flex min-w-0 max-w-full items-center gap-1.5 font-medium transition-colors group-hover:text-primary">
                      <User2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate break-all">{a.author}</span>
                    </h3>
                    <div className="mt-1.5 flex min-w-0 max-w-full items-center gap-2 overflow-hidden text-xs text-muted-foreground">
                      <span className="shrink-0">{a.videoCount} 个作品</span>
                      <span className="shrink-0">·</span>
                      <span className="min-w-0 truncate">{a.totalViews.toLocaleString()} 播放</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      {!isLoading && items.length === 0 && (
        <div className="text-center py-16">
          <div className="text-muted-foreground mb-4">
            <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无原作者数据</p>
            <p className="text-sm mt-1">投稿时填写「原作者」后，将自动出现在此</p>
          </div>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} className="mt-8" />
    </>
  );
}
