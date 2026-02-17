"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
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
import { AdSlot } from "@/components/ads/ad-slot";
import type { SerializedVideo } from "./page";

interface VideoPageClientProps {
  id: string;
  initialVideo: SerializedVideo;
}

export function VideoPageClient({ id: initialId, initialVideo }: VideoPageClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const playerRef = useRef<VideoPlayerRef>(null);
  const currentEpisodeRef = useRef<HTMLButtonElement | null>(null);
  const episodeListRef = useRef<HTMLDivElement | null>(null);

  // 当前播放的视频 ID（用于剧集切换，不触发路由导航）
  const [currentVideoId, setCurrentVideoId] = useState(initialId);
  
  // 检测是否是从外部导航进入（URL 的 id 变化）
  useEffect(() => {
    if (initialId !== currentVideoId) {
      setCurrentVideoId(initialId);
    }
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 客户端获取视频数据
  const { data: video, isLoading: isVideoLoading } = trpc.video.getById.useQuery(
    { id: currentVideoId },
    {
      staleTime: 30000,
      refetchOnMount: false,
    }
  );

  // 缓存上一次成功加载的视频，避免切换时闪烁"视频不存在"
  const lastVideoRef = useRef<typeof video | SerializedVideo>(initialVideo);
  
  // 优先使用客户端数据（包含最新的点赞等），然后是服务端数据，最后用缓存
  const displayVideo = video || (currentVideoId === initialId ? initialVideo : null) || lastVideoRef.current;
  
  // 更新缓存
  useEffect(() => {
    if (video) {
      lastVideoRef.current = video;
    }
  }, [video]);
  
  // 剧集切换 - 只更新状态和 URL，不触发路由导航
  const switchToEpisode = useCallback((videoId: string) => {
    if (videoId === currentVideoId) return;
    
    // 更新状态
    setCurrentVideoId(videoId);
    
    // 更新 URL（不触发导航）
    window.history.pushState({}, '', `/video/${videoId}`);
  }, [currentVideoId]);
  
  // 监听浏览器前进/后退
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/video\/(.+)$/);
      if (match && match[1] !== currentVideoId) {
        setCurrentVideoId(match[1]);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentVideoId]);
  
  // 分P状态管理
  const searchParams = useSearchParams();
  const hasPages = displayVideo?.pages && Array.isArray(displayVideo.pages) && displayVideo.pages.length > 1;
  
  // 从 URL 参数读取当前分P
  const urlPage = searchParams.get("p");
  const initialPage = urlPage ? parseInt(urlPage, 10) : 1;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  // 移动端 UI 状态
  const [descExpanded, setDescExpanded] = useState(false);
  const [mobileSeriesExpanded, setMobileSeriesExpanded] = useState(false);
  const [mobilePagesExpanded, setMobilePagesExpanded] = useState(false);
  
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

  // 获取视频所属的合集（使用 initialId，因为同系列视频返回相同数据）
  const { data: seriesData } = trpc.series.getByVideoId.useQuery(
    { videoId: initialId },
    { staleTime: 60000 }
  );

  const seriesEpisodes = useMemo(() => {
    if (!seriesData?.series?.episodes) return [];
    return [...seriesData.series.episodes].sort((a, b) => a.episodeNum - b.episodeNum);
  }, [seriesData]);

  const currentEpisodeIndex = useMemo(() => {
    if (!seriesEpisodes.length) return -1;
    return seriesEpisodes.findIndex((ep) => ep.video.id === currentVideoId);
  }, [seriesEpisodes, currentVideoId]);

  // 首次加载时滚动剧集面板到当前剧集（不影响页面滚动）
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    // 只在首次加载且有剧集数据时滚动
    if (initialScrollDoneRef.current) return;
    if (!currentEpisodeRef.current || !episodeListRef.current || currentEpisodeIndex < 0) return;
    
    initialScrollDoneRef.current = true;
    // 直接设置容器 scrollTop，不使用 scrollIntoView（会影响页面滚动）
    const container = episodeListRef.current;
    const element = currentEpisodeRef.current;
    const containerHeight = container.clientHeight;
    const elementTop = element.offsetTop;
    const elementHeight = element.clientHeight;
    // 将当前剧集滚动到容器中间
    container.scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
  }, [currentEpisodeIndex]);

  const { data: status } = trpc.video.getInteractionStatus.useQuery(
    { videoId: currentVideoId },
    { enabled: !!session }
  );

  const incrementViews = trpc.video.incrementViews.useMutation();
  const utils = trpc.useUtils();

  const likeMutation = trpc.video.like.useMutation({
    onMutate: async (vars) => {
      const vid = vars.videoId;
      await utils.video.getInteractionStatus.cancel({ videoId: vid });
      const prev = utils.video.getInteractionStatus.getData({ videoId: vid });
      utils.video.getInteractionStatus.setData({ videoId: vid }, () => ({
        liked: !prev?.liked,
        disliked: prev?.disliked ?? false,
        confused: prev?.confused ?? false,
        favorited: prev?.favorited ?? false,
      }));
      const prevVideo = utils.video.getById.getData({ id: vid });
      if (prevVideo?._count) {
        const delta = prev?.liked ? -1 : 1;
        utils.video.getById.setData({ id: vid }, (old) => old ? { ...old, _count: { ...old._count, likes: Math.max(0, (old._count?.likes ?? 0) + delta) } } : old);
      }
      return { prev };
    },
    onSettled: (_data, _err, vars) => {
      utils.video.getById.invalidate({ id: vars.videoId });
      utils.video.getInteractionStatus.invalidate({ videoId: vars.videoId });
    },
  });
  const dislikeMutation = trpc.video.dislike.useMutation({
    onMutate: async (vars) => {
      const vid = vars.videoId;
      await utils.video.getInteractionStatus.cancel({ videoId: vid });
      const prev = utils.video.getInteractionStatus.getData({ videoId: vid });
      utils.video.getInteractionStatus.setData({ videoId: vid }, () => ({
        liked: prev?.liked ?? false,
        disliked: !prev?.disliked,
        confused: prev?.confused ?? false,
        favorited: prev?.favorited ?? false,
      }));
      const prevVideo = utils.video.getById.getData({ id: vid });
      if (prevVideo?._count) {
        const delta = prev?.disliked ? -1 : 1;
        utils.video.getById.setData({ id: vid }, (old) => old ? { ...old, _count: { ...old._count, dislikes: Math.max(0, (old._count?.dislikes ?? 0) + delta) } } : old);
      }
      return { prev };
    },
    onSettled: (_data, _err, vars) => {
      utils.video.getById.invalidate({ id: vars.videoId });
      utils.video.getInteractionStatus.invalidate({ videoId: vars.videoId });
    },
  });
  const confusedMutation = trpc.video.confused.useMutation({
    onMutate: async (vars) => {
      const vid = vars.videoId;
      await utils.video.getInteractionStatus.cancel({ videoId: vid });
      const prev = utils.video.getInteractionStatus.getData({ videoId: vid });
      utils.video.getInteractionStatus.setData({ videoId: vid }, () => ({
        liked: prev?.liked ?? false,
        disliked: prev?.disliked ?? false,
        confused: !prev?.confused,
        favorited: prev?.favorited ?? false,
      }));
      const prevVideo = utils.video.getById.getData({ id: vid });
      if (prevVideo?._count) {
        const delta = prev?.confused ? -1 : 1;
        utils.video.getById.setData({ id: vid }, (old) => old ? { ...old, _count: { ...old._count, confused: Math.max(0, (old._count?.confused ?? 0) + delta) } } : old);
      }
      return { prev };
    },
    onSettled: (_data, _err, vars) => {
      utils.video.getById.invalidate({ id: vars.videoId });
      utils.video.getInteractionStatus.invalidate({ videoId: vars.videoId });
    },
  });
  const favoriteMutation = trpc.video.favorite.useMutation({
    onMutate: async (vars) => {
      const vid = vars.videoId;
      await utils.video.getInteractionStatus.cancel({ videoId: vid });
      const prev = utils.video.getInteractionStatus.getData({ videoId: vid });
      utils.video.getInteractionStatus.setData({ videoId: vid }, () => ({
        liked: prev?.liked ?? false,
        disliked: prev?.disliked ?? false,
        confused: prev?.confused ?? false,
        favorited: !prev?.favorited,
      }));
      const prevVideo = utils.video.getById.getData({ id: vid });
      if (prevVideo?._count) {
        const delta = prev?.favorited ? -1 : 1;
        utils.video.getById.setData({ id: vid }, (old) => old ? { ...old, _count: { ...old._count, favorites: Math.max(0, (old._count?.favorites ?? 0) + delta) } } : old);
      }
      return { prev };
    },
    onSettled: (_data, _err, vars) => {
      utils.video.getById.invalidate({ id: vars.videoId });
      utils.video.getInteractionStatus.invalidate({ videoId: vars.videoId });
    },
  });
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

  // 延迟 isOwner 判断到客户端挂载后，避免 SSR/CSR 不一致导致水合失败
  // （SSR 时 session 为 null → isOwner=false，客户端 session 可能立即有值 → isOwner=true）
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  const isOwner = hasMounted && session?.user?.id === displayVideo?.uploader?.id;

  // 增加观看次数
  useEffect(() => {
    incrementViews.mutate({ id: currentVideoId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideoId]);

  // 记录观看历史（用户登录时）
  const historyRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    // 确保只在 session 和 displayVideo 都加载完成后记录一次
    if (session?.user && displayVideo && historyRecordedRef.current !== currentVideoId) {
      historyRecordedRef.current = currentVideoId;
      recordHistoryMutation.mutate({ videoId: currentVideoId, progress: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVideoId, session?.user, displayVideo]);

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
          videoId: currentVideoId,
          progress: progress.playedSeconds,
        });
      }
    },
    [currentVideoId, session, recordHistoryMutation]
  );

  const handleLike = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await likeMutation.mutateAsync({ videoId: currentVideoId });
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
      await dislikeMutation.mutateAsync({ videoId: currentVideoId });
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
      await confusedMutation.mutateAsync({ videoId: currentVideoId });
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
      const result = await favoriteMutation.mutateAsync({ videoId: currentVideoId });
      toast.success(result.favorited ? "已添加到收藏" : "已取消收藏");
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
          { name: displayVideo.title, url: `${baseUrl}/video/${displayVideo.id}` },
        ]}
      />

      <div className="md:px-6 md:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 md:gap-6 items-start">
          <div className="lg:col-span-2 space-y-0 md:space-y-4">
            {/* 播放器 - 只渲染一个实例 */}
            <VideoPlayer
              ref={playerRef}
              url={currentVideoUrl || displayVideo.videoUrl}
              poster={getCoverUrl(displayVideo.id, displayVideo.coverUrl)}
              onProgress={handleProgress}
            />

            {/* 移动端标题和元信息区 - 类似 YouTube/B站 可展开区域 */}
            <div className="md:hidden px-3 pt-3">
              <div className="flex items-start justify-between gap-2">
                <div 
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="flex-1 min-w-0 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setDescExpanded(!descExpanded)}
                >
                  <h1 className={`text-base font-bold leading-snug ${!descExpanded ? 'line-clamp-2' : ''}`}>
                    {displayVideo.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{formatViews(displayVideo.views)}次观看</span>
                    <span>·</span>
                    <span>{formatRelativeTime(displayVideo.createdAt)}</span>
                    {!descExpanded && (displayVideo.description || displayVideo.tags.length > 0) && (
                      <span className="ml-auto text-primary">展开</span>
                    )}
                  </div>
                </div>
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="更多操作">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/video/edit/${currentVideoId}`}>
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
                              onClick={() => deleteMutation.mutate({ id: currentVideoId })}
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

              {/* 展开的描述和标签 */}
              {descExpanded && (
                <div className="mt-3 pt-3 border-t space-y-3">
                  {displayVideo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {displayVideo.tags.map(({ tag }) => (
                        <Link 
                          key={tag.id} 
                          href={`/video/tag/${tag.slug}`}
                          className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full"
                        >
                          #{tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                  {displayVideo.description && (
                    <div className="text-sm text-muted-foreground">
                      <Markdown content={displayVideo.description} />
                    </div>
                  )}
                  {displayVideo.extraInfo && typeof displayVideo.extraInfo === 'object' && !Array.isArray(displayVideo.extraInfo) && (
                    <VideoExtraInfoSection extraInfo={displayVideo.extraInfo as import("@/lib/shortcode-parser").VideoExtraInfo} />
                  )}
                  <button 
                    onClick={() => setDescExpanded(false)}
                    className="text-xs text-primary"
                  >
                    收起
                  </button>
                </div>
              )}
            </div>

            {/* 移动端 UP 主信息 */}
            <div className="md:hidden px-3 py-2">
              <Link
                href={`/user/${displayVideo.uploader.id}`}
                className="flex items-center gap-2.5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={displayVideo.uploader.avatar || undefined} />
                  <AvatarFallback className="text-sm">
                    {(displayVideo.uploader.nickname || displayVideo.uploader.username)
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {displayVideo.uploader.nickname || displayVideo.uploader.username}
                </span>
              </Link>
            </div>

            {/* 移动端操作按钮 - 水平滚动 pill 样式 */}
            <div className="md:hidden overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 px-3 py-2 min-w-max">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(); }}
                  disabled={likeMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    status?.liked 
                      ? 'bg-green-600 text-white' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${status?.liked ? 'fill-current' : ''}`} />
                  <span>{displayVideo._count.likes || '喜欢'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfused(); }}
                  disabled={confusedMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    status?.confused 
                      ? 'bg-yellow-600 text-white' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <HelpCircle className={`h-4 w-4 ${status?.confused ? 'fill-current' : ''}`} />
                  <span>{displayVideo._count.confused || '疑惑'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDislike(); }}
                  disabled={dislikeMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    status?.disliked 
                      ? 'bg-red-600 text-white' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <ThumbsDown className={`h-4 w-4 ${status?.disliked ? 'fill-current' : ''}`} />
                  <span>{displayVideo._count.dislikes || '不喜欢'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFavorite(); }}
                  disabled={favoriteMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    status?.favorited 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <Star className={`h-4 w-4 ${status?.favorited ? 'fill-current' : ''}`} />
                  <span>收藏</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  <span>分享</span>
                </button>
              </div>
            </div>

            {/* 移动端合集选集 - 可折叠卡片 */}
            {seriesData?.series && (
              <div className="md:hidden mx-3 my-2 border rounded-xl overflow-hidden bg-card">
                <button
                  onClick={() => setMobileSeriesExpanded(!mobileSeriesExpanded)}
                  className="w-full flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="relative w-16 h-10 rounded overflow-hidden bg-muted shrink-0">
                    {seriesEpisodes[currentEpisodeIndex]?.video ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={getCoverUrl(seriesEpisodes[currentEpisodeIndex].video.id, seriesEpisodes[currentEpisodeIndex].video.coverUrl)} 
                        alt="" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">{seriesData.series.title}</p>
                    <p className="text-xs text-muted-foreground">
                      第 {currentEpisodeIndex >= 0 ? seriesEpisodes[currentEpisodeIndex]?.episodeNum : '?'} 集 / 共 {seriesData.series.episodes.length} 集
                    </p>
                  </div>
                  <div className={`shrink-0 transition-transform ${mobileSeriesExpanded ? 'rotate-180' : ''}`}>
                    <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {mobileSeriesExpanded && (
                  <div className="border-t max-h-64 overflow-y-auto">
                    {seriesEpisodes.map((ep) => {
                      const isCurrentVideo = ep.video.id === currentVideoId;
                      return (
                        <button
                          key={ep.video.id}
                          onClick={() => {
                            switchToEpisode(ep.video.id);
                            setMobileSeriesExpanded(false);
                          }}
                          disabled={isVideoLoading}
                          className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 ${
                            isCurrentVideo ? 'bg-primary/10' : ''
                          } ${isVideoLoading && !isCurrentVideo ? 'opacity-70' : ''}`}
                        >
                          <span className={`text-xs font-medium shrink-0 w-8 ${
                            isCurrentVideo ? 'text-primary' : 'text-muted-foreground'
                          }`}>
                            {ep.episodeNum}
                          </span>
                          <span className={`text-sm truncate flex-1 ${isCurrentVideo ? 'text-primary font-medium' : ''}`}>
                            {ep.episodeTitle || ep.video.title}
                          </span>
                          {isCurrentVideo && (
                            <Play className="h-3 w-3 text-primary fill-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 移动端分P列表 - 可折叠卡片 */}
            {hasPages && displayVideo.pages && (
              <div className="md:hidden mx-3 my-2 border rounded-xl overflow-hidden bg-card">
                <button
                  onClick={() => setMobilePagesExpanded(!mobilePagesExpanded)}
                  className="w-full flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <List className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium">视频选集</p>
                    <p className="text-xs text-muted-foreground">
                      P{currentPage} / 共 {(displayVideo.pages as { page: number; title: string }[]).length}P
                    </p>
                  </div>
                  <div className={`shrink-0 transition-transform ${mobilePagesExpanded ? 'rotate-180' : ''}`}>
                    <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {mobilePagesExpanded && (
                  <div className="border-t max-h-64 overflow-y-auto">
                    {(displayVideo.pages as { page: number; title: string }[]).map((page) => {
                      const isCurrent = currentPage === page.page;
                      return (
                        <button
                          key={page.page}
                          onClick={() => {
                            handlePageChange(page.page);
                            setMobilePagesExpanded(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 text-left ${
                            isCurrent ? 'bg-primary/10' : ''
                          }`}
                        >
                          <span className={`text-xs font-medium shrink-0 w-8 ${
                            isCurrent ? 'text-primary' : 'text-muted-foreground'
                          }`}>
                            P{page.page}
                          </span>
                          <span className={`text-sm truncate flex-1 ${isCurrent ? 'text-primary font-medium' : ''}`}>
                            {page.title}
                          </span>
                          {isCurrent && (
                            <Play className="h-3 w-3 text-primary fill-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 桌面端标题和信息区 */}
            <div className="hidden md:block">
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
                        <Link href={`/video/edit/${currentVideoId}`}>
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
                              onClick={() => deleteMutation.mutate({ id: currentVideoId })}
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

            {/* 桌面端 UP 主和操作按钮 */}
            <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
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
                  type="button"
                  variant={status?.liked ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleLike(); }}
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
                  type="button"
                  variant={status?.confused ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleConfused(); }}
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
                  type="button"
                  variant={status?.disliked ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDislike(); }}
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
                  type="button"
                  variant={status?.favorited ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleFavorite(); }}
                  disabled={favoriteMutation.isPending}
                  className="px-2 sm:px-3"
                >
                  <Star
                    className={`h-4 w-4 sm:mr-1 ${status?.favorited ? "fill-current" : ""}`}
                  />
                  <span className="hidden sm:inline">收藏</span>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShare(); }} className="px-2 sm:px-3">
                  <Share2 className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">分享</span>
                </Button>
              </div>
            </div>

            <Separator className="hidden md:block" />

            {/* 桌面端标签和描述 */}
            <div className="hidden md:block space-y-4">
              {displayVideo.tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">标签:</span>
                  {displayVideo.tags.map(({ tag }) => (
                    <Badge key={tag.id} variant="outline">
                      <Link href={`/video/tag/${tag.slug}`}>{tag.name}</Link>
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

            <Separator className="my-4 md:my-6" />

            {/* 评论区 */}
            <div className="px-3 md:px-0">
              <CommentSection videoId={currentVideoId} />
            </div>
          </div>

          {/* 桌面端侧边栏 - sticky 定位，占满右侧高度 */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-[4.5rem] flex flex-col" style={{ maxHeight: 'calc(100vh - 5.5rem)' }}>
              {/* 合集选集 - 不折叠，占满高度 */}
              {seriesData?.series && (
                <div className="border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b shrink-0">
                    <Layers className="h-4 w-4 text-primary" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">
                        <Link href={`/series/${seriesData.series.id}`} className="hover:text-primary transition-colors">
                          {seriesData.series.title}
                        </Link>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        第 {currentEpisodeIndex >= 0 ? seriesEpisodes[currentEpisodeIndex]?.episodeNum : '?'} 集 / 共 {seriesData.series.episodes.length} 集
                      </p>
                    </div>
                  </div>
                  <div ref={episodeListRef} className="overflow-y-auto flex-1">
                    {seriesEpisodes.map((ep) => {
                      const isCurrentVideo = ep.video.id === currentVideoId;
                      return (
                        <button
                          key={ep.video.id}
                          onClick={() => switchToEpisode(ep.video.id)}
                          disabled={isVideoLoading}
                          ref={isCurrentVideo ? currentEpisodeRef : null}
                          aria-current={isCurrentVideo ? "true" : undefined}
                          className={`w-full text-left flex items-center gap-3 p-3 border-b last:border-b-0 transition-colors ${
                            isCurrentVideo ? "bg-primary/10" : "hover:bg-muted/50"
                          } ${isVideoLoading && !isCurrentVideo ? "opacity-70" : ""}`}
                        >
                          <div className="relative w-20 h-12 rounded overflow-hidden bg-muted shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={getCoverUrl(ep.video.id, ep.video.coverUrl)} alt="" className="w-full h-full object-cover" />
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
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 分P列表 - 不折叠，占满高度 */}
              {hasPages && displayVideo.pages && !seriesData?.series && (
                <div className="border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b shrink-0">
                    <List className="h-4 w-4 text-primary" />
                    <h3 className="font-medium text-sm">视频选集</h3>
                    <Badge variant="secondary" className="text-xs">
                      {(displayVideo.pages as { page: number; title: string }[]).length}P
                    </Badge>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-1">
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

              {/* 如果同时有合集和分P，分P显示在合集下方 */}
              {hasPages && displayVideo.pages && seriesData?.series && (
                <div className="border rounded-lg overflow-hidden mt-4 shrink-0">
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                    <List className="h-4 w-4 text-primary" />
                    <h3 className="font-medium text-sm">视频选集</h3>
                    <Badge variant="secondary" className="text-xs">
                      {(displayVideo.pages as { page: number; title: string }[]).length}P
                    </Badge>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
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

              {/* 右侧栏广告位 - 选集框下方 */}
              <div className="mt-4 shrink-0">
                <AdSlot slotId="video-sidebar" minHeight={100} className="w-full" />
              </div>
            </div>
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
