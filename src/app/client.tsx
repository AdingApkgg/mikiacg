"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X, ChevronLeft, ChevronRight, Play, Layers } from "lucide-react";
import { PageWrapper, FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { getCoverUrl } from "@/lib/cover";

type ViewMode = "videos" | "series";
type SortBy = "latest" | "views" | "likes";

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface Video {
  id: string;
  title: string;
  coverUrl: string | null;
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

interface HomePageClientProps {
  initialTags: Tag[];
  initialVideos: Video[];
  siteConfig: {
    announcement: string | null;
    announcementEnabled: boolean;
  } | null;
}

export function HomePageClient({ initialTags, initialVideos, siteConfig }: HomePageClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("videos");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [videoPage, setVideoPage] = useState(1);
  const [seriesPage, setSeriesPage] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 视频列表查询
  const {
    data: videoData,
    isLoading: videoLoading,
  } = trpc.video.list.useQuery(
    { 
      limit: 20, 
      page: videoPage,
      sortBy, 
      tagId: selectedTag || undefined,
    },
    {
      enabled: viewMode === "videos",
      placeholderData: (prev) => prev,
    }
  );

  // 合集列表查询
  const {
    data: seriesData,
    isLoading: seriesLoading,
  } = trpc.series.list.useQuery(
    { limit: 12, page: seriesPage },
    {
      enabled: viewMode === "series",
      placeholderData: (prev) => prev,
    }
  );

  // 数据
  const videos = videoData?.videos ?? (videoPage === 1 ? initialVideos : []);
  const videoTotalPages = videoData?.totalPages ?? 1;
  const series = seriesData?.items ?? [];
  const seriesTotalPages = seriesData?.totalPages ?? 1;


  // 检查滚动箭头显示状态
  const checkScrollArrows = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  useEffect(() => {
    checkScrollArrows();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollArrows);
      window.addEventListener("resize", checkScrollArrows);
      return () => {
        container.removeEventListener("scroll", checkScrollArrows);
        window.removeEventListener("resize", checkScrollArrows);
      };
    }
  }, [initialTags]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // 视图模式选项
  const viewModeOptions: { id: ViewMode; label: string }[] = [
    { id: "videos", label: "视频" },
    { id: "series", label: "作者" },
  ];

  // 排序选项
  const sortOptions: { id: SortBy; label: string }[] = [
    { id: "latest", label: "最新" },
    { id: "views", label: "热门" },
    { id: "likes", label: "高赞" },
  ];

  const handleViewModeClick = (id: ViewMode) => {
    setViewMode(id);
    // 切换到合集模式时清除标签筛选
    if (id === "series") {
      setSelectedTag(null);
    }
  };

  const handleSortClick = (id: SortBy) => {
    setSortBy(id);
    setVideoPage(1);
  };

  const handleTagClick = (tagId: string) => {
    // 合集模式下不支持标签筛选
    if (viewMode === "series") return;
    if (selectedTag === tagId) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tagId);
    }
    setVideoPage(1);
  };

  return (
    <PageWrapper>
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        {/* 公告横幅 */}
        {siteConfig?.announcementEnabled && siteConfig.announcement && (
          <div 
            className={`mb-4 relative overflow-hidden transition-all duration-300 ${
              showAnnouncement ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
              <p className="text-sm text-yellow-600 dark:text-yellow-400 flex-1">
                {siteConfig.announcement}
              </p>
              <button
                onClick={() => setShowAnnouncement(false)}
                className="text-yellow-500 hover:text-yellow-600 dark:hover:text-yellow-300 transition-all hover:scale-110 active:scale-90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* YouTube 风格的标签栏 */}
        <FadeIn delay={0.15}>
          <div className="relative mb-6 overflow-hidden">
            {/* 左侧渐变和箭头 */}
            {showLeftArrow && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("left")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* 标签滚动容器 */}
            <div
              ref={scrollContainerRef}
              className="flex gap-2 overflow-x-auto scrollbar-none scroll-smooth px-1 py-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* 视图模式切换 */}
              {viewModeOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleViewModeClick(option.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    viewMode === option.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}

              {/* 分隔线 */}
              <div className="shrink-0 w-px bg-border my-1" />

              {/* 排序按钮（仅视频模式） */}
              {viewMode === "videos" && sortOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSortClick(option.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    sortBy === option.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}

              {/* 视频模式下的分隔线和标签 */}
              {viewMode === "videos" && (
                <>
                  <div className="shrink-0 w-px bg-border my-1" />
                  {initialTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleTagClick(tag.id)}
                      className={cn(
                        "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                        selectedTag === tag.id
                          ? "bg-foreground text-background"
                          : "bg-muted hover:bg-muted/80 text-foreground"
                      )}
                    >
                      {tag.name}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* 右侧渐变和箭头 */}
            {showRightArrow && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("right")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </FadeIn>

        {/* 内容区域 */}
        <section>
          {viewMode === "videos" ? (
            // 视频网格
            <>
              <div key={`${sortBy}-${selectedTag}-${videoPage}`}>
                <VideoGrid videos={videos} isLoading={videoLoading && videos.length === 0} />
                
                {/* 无结果提示 */}
                {!videoLoading && videos.length === 0 && (
                  <div className="text-center py-16">
                    <div className="text-muted-foreground mb-4">
                      <p className="text-lg font-medium">没有找到视频</p>
                      <p className="text-sm mt-1">
                        {selectedTag ? "尝试选择其他标签" : "暂无视频内容"}
                      </p>
                    </div>
                    {selectedTag && (
                      <Button variant="outline" onClick={() => setSelectedTag(null)} className="mt-4">
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
            // 合集网格
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {seriesLoading && series.length === 0 ? (
                  // 加载骨架屏
                  Array.from({ length: 8 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <Skeleton className="aspect-video w-full" />
                      <CardContent className="p-3 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  series.map((s) => (
                    <Link key={s.id} href={`/series/${s.id}`}>
                      <Card className="overflow-hidden group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                        {/* 合集封面 - 2x2 网格预览 */}
                        <div className="relative aspect-video bg-muted">
                          {s.previewVideos.length > 0 ? (
                            <div className="grid grid-cols-2 grid-rows-2 h-full">
                              {[0, 1, 2, 3].map((idx) => {
                                const video = s.previewVideos[idx];
                                return (
                                  <div key={idx} className="relative overflow-hidden">
                                    {video ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={getCoverUrl(video.id, video.coverUrl)}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-muted flex items-center justify-center">
                                        <Play className="w-6 h-6 text-muted-foreground/50" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : s.coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={s.coverUrl}
                              alt={s.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Layers className="w-12 h-12 text-muted-foreground/30" />
                            </div>
                          )}
                          
                          {/* 集数徽章 */}
                          <Badge 
                            className="absolute bottom-2 right-2 bg-black/70 hover:bg-black/70 text-white"
                          >
                            {s.episodeCount} 集
                          </Badge>

                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                            <Play className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        <CardContent className="p-3">
                          <h3 className="font-medium line-clamp-2 group-hover:text-primary transition-colors">
                            {s.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            <span>{s.creator.nickname || s.creator.username}</span>
                            <span>·</span>
                            <span>{s.totalViews.toLocaleString()} 播放</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>

              {/* 无结果提示 */}
              {!seriesLoading && series.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-muted-foreground mb-4">
                    <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">暂无合集</p>
                    <p className="text-sm mt-1">还没有创建任何视频合集</p>
                  </div>
                </div>
              )}

              {/* 分页器 */}
              <Pagination
                currentPage={seriesPage}
                totalPages={seriesTotalPages}
                onPageChange={setSeriesPage}
                className="mt-8"
              />
            </>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}
