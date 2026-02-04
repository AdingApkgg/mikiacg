"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { VideoPlayer, type VideoPlayerRef } from "@/components/video/video-player";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/ui/markdown";
import { Heart, ThumbsDown, HelpCircle, Star, Share2, Eye, Calendar, Edit, MoreVertical, Trash2, List, Play, Layers, User, Download, ExternalLink, Info, AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import { CommentSection } from "@/components/comment/comment-section";
import { VideoJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { getCoverUrl } from "@/lib/cover";
import type { SerializedVideo } from "./page";

interface VideoPageClientProps {
  id: string;
  initialVideo: SerializedVideo;
}

export function VideoPageClient({ id, initialVideo }: VideoPageClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const playerRef = useRef<VideoPlayerRef>(null);
  const currentEpisodeRef = useRef<HTMLAnchorElement | null>(null);

  // 客户端获取视频数据（用于交互后刷新）
  const { data: video } = trpc.video.getById.useQuery(
    { id },
    {
      staleTime: 30000, // 30秒内不重新请求
      refetchOnMount: false, // 首次挂载时不请求（使用服务端数据）
    }
  );

  // 优先使用客户端数据（包含最新的点赞等），然后是服务端数据
  const displayVideo = video || initialVideo;
  
  // 分P状态管理
  const searchParams = useSearchParams();
  const hasPages = displayVideo?.pages && Array.isArray(displayVideo.pages) && displayVideo.pages.length > 1;
  
  // 从 URL 参数读取当前分P
  const urlPage = searchParams.get("p");
  const initialPage = urlPage ? parseInt(urlPage, 10) : 1;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [seriesExpanded, setSeriesExpanded] = useState(false);
  
  // URL 参数变化时同步状态
  useEffect(() => {
    const p = searchParams.get("p");
    const pageNum = p ? parseInt(p, 10) : 1;
    if (pageNum !== currentPage && pageNum >= 1) {
      setCurrentPage(pageNum);
    }
  }, [searchParams, currentPage]);
  
  // 切换分P时更新 URL
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // 更新 URL 但不刷新页面
    const url = new URL(window.location.href);
    if (page > 1) {
      url.searchParams.set("p", String(page));
    } else {
      url.searchParams.delete("p");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);
  
  // 计算当前视频URL
  const currentVideoUrl = useMemo(() => {
    if (!displayVideo?.videoUrl || !hasPages) return displayVideo?.videoUrl;
    // 替换或添加p参数
    const baseUrl = displayVideo.videoUrl.replace(/[?&]p=\d+/, '');
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}p=${currentPage}`;
  }, [displayVideo?.videoUrl, hasPages, currentPage]);

  // 获取视频所属的合集
  const { data: seriesData } = trpc.series.getByVideoId.useQuery(
    { videoId: id },
    { staleTime: 60000 }
  );

  const seriesEpisodes = useMemo(() => {
    if (!seriesData?.series?.episodes) return [];
    return [...seriesData.series.episodes].sort((a, b) => a.episodeNum - b.episodeNum);
  }, [seriesData]);

  const currentEpisodeIndex = useMemo(() => {
    if (!seriesEpisodes.length) return -1;
    return seriesEpisodes.findIndex((ep) => ep.video.id === id);
  }, [seriesEpisodes, id]);

  const hasMoreEpisodes = seriesEpisodes.length > 12;
  const visibleEpisodes = seriesExpanded ? seriesEpisodes : seriesEpisodes.slice(0, 12);

  useEffect(() => {
    if (!seriesEpisodes.length) return;
    if (!seriesExpanded && currentEpisodeIndex >= 12) {
      setSeriesExpanded(true);
    }
  }, [seriesEpisodes.length, currentEpisodeIndex, seriesExpanded]);

  useEffect(() => {
    if (!seriesExpanded) return;
    if (!currentEpisodeRef.current) return;
    currentEpisodeRef.current.scrollIntoView({ block: "nearest" });
  }, [seriesExpanded, currentEpisodeIndex]);

  const { data: status } = trpc.video.getInteractionStatus.useQuery(
    { videoId: id },
    { enabled: !!session }
  );

  const incrementViews = trpc.video.incrementViews.useMutation();
  const likeMutation = trpc.video.like.useMutation();
  const dislikeMutation = trpc.video.dislike.useMutation();
  const confusedMutation = trpc.video.confused.useMutation();
  const recordHistoryMutation = trpc.video.recordHistory.useMutation({
    onError: (error) => {
      console.error("记录观看历史失败:", error.message);
    },
  });
  const deleteMutation = trpc.video.delete.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      router.push("/my-videos");
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const isOwner = session?.user?.id === displayVideo?.uploader?.id;
  const favoriteMutation = trpc.video.favorite.useMutation();
  const utils = trpc.useUtils();

  // 增加观看次数
  useEffect(() => {
    incrementViews.mutate({ id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 记录观看历史（用户登录时）
  const historyRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    // 确保只在 session 和 displayVideo 都加载完成后记录一次
    if (session?.user && displayVideo && historyRecordedRef.current !== id) {
      historyRecordedRef.current = id;
      recordHistoryMutation.mutate({ videoId: id, progress: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.user, displayVideo]);

  // 更新观看进度（每 30 秒更新一次）
  const lastProgressUpdateRef = useRef(0);
  const handleProgress = useCallback(
    (progress: { played: number; playedSeconds: number }) => {
      if (!session) return;
      const now = Date.now();
      // 每 30 秒更新一次进度
      if (now - lastProgressUpdateRef.current > 30000) {
        lastProgressUpdateRef.current = now;
        recordHistoryMutation.mutate({
          videoId: id,
          progress: progress.playedSeconds,
        });
      }
    },
    [id, session, recordHistoryMutation]
  );

  const handleLike = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await likeMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleDislike = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await dislikeMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleConfused = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await confusedMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleFavorite = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      const result = await favoriteMutation.mutateAsync({ videoId: id });
      toast.success(result.favorited ? "已添加到收藏" : "已取消收藏");
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-HTTPS
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请手动复制链接");
    }
  };

  // 由于有 initialVideo，不需要 loading 状态
  if (!displayVideo) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">视频不存在</h1>
        <p className="text-muted-foreground mt-2">该视频可能已被删除或不存在</p>
        <Button asChild className="mt-4">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.mikiacg.vip";

  return (
    <>
      {/* SEO 结构化数据 */}
      <VideoJsonLd video={displayVideo} />
      <BreadcrumbJsonLd
        items={[
          { name: "首页", url: baseUrl },
          { name: displayVideo.title, url: `${baseUrl}/v/${displayVideo.id}` },
        ]}
      />

      <div className="px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer
              ref={playerRef}
              url={currentVideoUrl || displayVideo.videoUrl}
              poster={getCoverUrl(displayVideo.id, displayVideo.coverUrl)}
              onProgress={handleProgress}
            />

          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-lg sm:text-xl font-bold">{displayVideo.title}</h1>
              
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="更多操作">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/v/edit/${id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        编辑视频
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除视频
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确定要删除这个视频吗？</AlertDialogTitle>
                          <AlertDialogDescription>
                            视频 &ldquo;{displayVideo.title}&rdquo; 将被删除，此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ id })}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {formatViews(displayVideo.views)} 次观看
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(displayVideo.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <Link
              href={`/user/${displayVideo.uploader.id}`}
              className="flex items-center gap-3 hover:opacity-80"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={displayVideo.uploader.avatar || undefined} />
                <AvatarFallback>
                  {(displayVideo.uploader.nickname || displayVideo.uploader.username)
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {displayVideo.uploader.nickname || displayVideo.uploader.username}
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Button
                variant={status?.liked ? "default" : "outline"}
                size="sm"
                onClick={handleLike}
                disabled={likeMutation.isPending}
                className={`px-2 sm:px-3 ${status?.liked ? "bg-green-600 hover:bg-green-700" : ""}`}
              >
                <Heart
                  className={`h-4 w-4 sm:mr-1 ${status?.liked ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.likes}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.likes}</span>
              </Button>
              <Button
                variant={status?.confused ? "default" : "outline"}
                size="sm"
                onClick={handleConfused}
                disabled={confusedMutation.isPending}
                className={`px-2 sm:px-3 ${status?.confused ? "bg-yellow-600 hover:bg-yellow-700" : ""}`}
              >
                <HelpCircle
                  className={`h-4 w-4 sm:mr-1 ${status?.confused ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.confused}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.confused}</span>
              </Button>
              <Button
                variant={status?.disliked ? "default" : "outline"}
                size="sm"
                onClick={handleDislike}
                disabled={dislikeMutation.isPending}
                className={`px-2 sm:px-3 ${status?.disliked ? "bg-red-600 hover:bg-red-700" : ""}`}
              >
                <ThumbsDown
                  className={`h-4 w-4 sm:mr-1 ${status?.disliked ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.dislikes}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.dislikes}</span>
              </Button>
              <Button
                variant={status?.favorited ? "default" : "outline"}
                size="sm"
                onClick={handleFavorite}
                disabled={favoriteMutation.isPending}
                className="px-2 sm:px-3"
              >
                <Star
                  className={`h-4 w-4 sm:mr-1 ${status?.favorited ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">收藏</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare} className="px-2 sm:px-3">
                <Share2 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">分享</span>
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            {displayVideo.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">标签:</span>
                {displayVideo.tags.map(({ tag }) => (
                  <Badge key={tag.id} variant="outline">
                    <Link href={`/tag/${tag.slug}`}>{tag.name}</Link>
                  </Badge>
                ))}
              </div>
            )}

            {displayVideo.description && (
              <div>
                <h3 className="font-medium mb-2">简介</h3>
                <Markdown content={displayVideo.description} />
              </div>
            )}

            {/* 扩展信息 */}
            {displayVideo.extraInfo && typeof displayVideo.extraInfo === 'object' && !Array.isArray(displayVideo.extraInfo) && (
              <VideoExtraInfoSection extraInfo={displayVideo.extraInfo as import("@/lib/shortcode-parser").VideoExtraInfo} />
            )}
          </div>

          <Separator className="my-6" />

          {/* 评论区 */}
          <CommentSection videoId={id} />
        </div>

        {/* 侧边栏 */}
        <div className="lg:col-span-1 mt-6 lg:mt-0 space-y-6">
          {/* 合集选集 */}
          {seriesData?.series && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <Layers className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">
                    <Link href={`/series/${seriesData.series.id}`} className="hover:text-primary transition-colors">
                      {seriesData.series.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    第 {seriesData.currentEpisode} 集 / 共 {seriesData.series.episodes.length} 集
                  </p>
                </div>
                {hasMoreEpisodes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSeriesExpanded((v) => !v)}
                  >
                    {seriesExpanded ? "收起" : "展开"}
                  </Button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {visibleEpisodes.map((ep) => {
                  const isCurrentVideo = ep.video.id === id;
                  return (
                    <Link
                      key={ep.video.id}
                      href={`/v/${ep.video.id}`}
                      ref={isCurrentVideo ? currentEpisodeRef : null}
                      aria-current={isCurrentVideo ? "true" : undefined}
                      className={`flex items-center gap-3 p-3 border-b last:border-b-0 transition-colors ${
                        isCurrentVideo ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="relative w-20 h-12 rounded overflow-hidden bg-muted shrink-0">
                        {ep.video.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ep.video.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Play className="h-4 w-4" />
                          </div>
                        )}
                        {isCurrentVideo && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Play className="h-4 w-4 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${isCurrentVideo ? "text-primary" : "text-muted-foreground"}`}>
                            第{ep.episodeNum}集
                          </span>
                          {isCurrentVideo && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              正在播放
                            </Badge>
                          )}
                        </div>
                        <p className={`text-sm truncate ${isCurrentVideo ? "font-medium" : ""}`}>
                          {ep.episodeTitle || ep.video.title}
                        </p>
                        {ep.video.duration && (
                          <p className="text-xs text-muted-foreground">
                            {Math.floor(ep.video.duration / 60)}:{String(ep.video.duration % 60).padStart(2, "0")}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
                {!seriesExpanded && hasMoreEpisodes && (
                  <div className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setSeriesExpanded(true)}
                    >
                      展开查看全部 ({seriesEpisodes.length} 集)
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 分P列表 */}
          {hasPages && displayVideo.pages && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4" />
                <h3 className="font-medium">视频选集</h3>
                <Badge variant="secondary" className="text-xs">
                  {(displayVideo.pages as { page: number; title: string }[]).length}P
                </Badge>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                {(displayVideo.pages as { page: number; title: string }[]).map((page) => (
                  <button
                    key={page.page}
                    onClick={() => handlePageChange(page.page)}
                    className={`w-full flex items-center gap-2 p-2 rounded text-left text-sm transition-colors ${
                      currentPage === page.page
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {currentPage === page.page && (
                      <Play className="h-3 w-3 shrink-0 fill-current" />
                    )}
                    <span className={`shrink-0 ${currentPage === page.page ? "" : "text-muted-foreground"}`}>
                      P{page.page}
                    </span>
                    <span className="truncate">{page.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
}


// 扩展信息展示组件
function VideoExtraInfoSection({ extraInfo }: { extraInfo: import("@/lib/shortcode-parser").VideoExtraInfo }) {
  const hasContent = extraInfo.intro || extraInfo.author || extraInfo.authorIntro ||
    (extraInfo.keywords && extraInfo.keywords.length > 0) ||
    (extraInfo.downloads && extraInfo.downloads.length > 0) ||
    (extraInfo.episodes && extraInfo.episodes.length > 0) ||
    (extraInfo.relatedVideos && extraInfo.relatedVideos.length > 0) ||
    (extraInfo.notices && extraInfo.notices.length > 0);

  if (!hasContent) return null;

  const noticeIcons = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle,
  };

  const noticeStyles = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    success: "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    error: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
  };

  return (
    <div className="space-y-4 pt-4 border-t">
      {/* 公告/提示 */}
      {extraInfo.notices && extraInfo.notices.length > 0 && (
        <div className="space-y-2">
          {extraInfo.notices.map((notice, index) => {
            const IconComponent = noticeIcons[notice.type];
            return (
              <div 
                key={index}
                className={`flex items-start gap-2 p-3 rounded-lg border ${noticeStyles[notice.type]}`}
              >
                <IconComponent className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-sm">{notice.content}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* 作品介绍 */}
      {extraInfo.intro && (
        <div className="space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            作品介绍
          </h3>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            {extraInfo.intro}
          </div>
        </div>
      )}

      {/* 剧集介绍 */}
      {extraInfo.episodes && extraInfo.episodes.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <List className="h-4 w-4" />
            剧集介绍
          </h3>
          <div className="space-y-3">
            {extraInfo.episodes.map((episode, index) => (
              <div key={index} className="p-3 rounded-lg bg-muted/50">
                <h4 className="font-medium text-sm">{episode.title}</h4>
                <p className="text-sm text-muted-foreground mt-1">{episode.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 作者信息 */}
      {(extraInfo.author || extraInfo.authorIntro) && (
        <div className="space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            作者信息
          </h3>
          <div className="p-3 rounded-lg bg-muted/50">
            {extraInfo.author && (
              <p className="text-sm">
                <span className="text-muted-foreground">原作者：</span>
                <span className="font-medium">{extraInfo.author}</span>
              </p>
            )}
            {extraInfo.authorIntro && (
              <p className="text-sm text-muted-foreground mt-2">{extraInfo.authorIntro}</p>
            )}
          </div>
        </div>
      )}

      {/* 搜索关键词 */}
      {extraInfo.keywords && extraInfo.keywords.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm">搜索关键词</h3>
          <div className="flex flex-wrap gap-1.5">
            {extraInfo.keywords.map((keyword, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* 下载链接 */}
      {extraInfo.downloads && extraInfo.downloads.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <Download className="h-4 w-4" />
            下载链接
          </h3>
          <div className="space-y-2">
            {extraInfo.downloads.map((download, index) => (
              <a
                key={index}
                href={download.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{download.name}</span>
                  {download.password && (
                    <Badge variant="outline" className="text-xs">
                      密码: {download.password}
                    </Badge>
                  )}
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 相关视频 */}
      {extraInfo.relatedVideos && extraInfo.relatedVideos.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" />
            相关视频
          </h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {extraInfo.relatedVideos.map((video, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="text-xs">•</span>
                {video}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
