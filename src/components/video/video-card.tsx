"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VideoCover } from "./video-cover";
import { Play, ThumbsUp, MessageCircle, Check } from "lucide-react";
import { formatDuration, formatViews } from "@/lib/format";
import { useSound } from "@/hooks/use-sound";
import { cn } from "@/lib/utils";
import { SearchHighlightText } from "@/components/shared/search-highlight-text";
import { CardMeta } from "@/components/shared/card-meta";
import { NewBadge, RankBadge, isNewlyUploaded } from "@/components/shared/card-badges";
import { HoverFavoriteButton } from "@/components/shared/hover-favorite-button";
import { trpc } from "@/lib/trpc";

const WATCHED_THRESHOLD = 0.95; // 看完进度阈值

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    coverUrl?: string | null;
    coverBlurHash?: string | null;
    duration?: number | null;
    views: number;
    createdAt: Date | string;
    /** 过审时间，存在时优先用作前台展示时间 */
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
    isNsfw?: boolean;
    _count: {
      likes: number;
      dislikes?: number;
      comments?: number;
      [key: string]: number | undefined;
    };
  };
  index?: number;
  /** 搜索结果页传入，用于标题高亮 */
  highlightQuery?: string | null;
  /** 当前用户的观看进度（来自 video.progressMap）。未登录或未观看时为 undefined */
  watchProgress?: { progress: number; duration: number | null };
  /** 排行榜场景：1/2/3 显示金/银/铜冠图标，其它整数显示数字徽章 */
  rank?: number;
  /** 当前用户是否已收藏该视频（来自 video.favoritedMap）。控制浮动按钮的填充态 */
  isFavorited?: boolean;
}

function VideoCardComponent({ video, index, highlightQuery, watchProgress, rank, isFavorited }: VideoCardProps) {
  const { play } = useSound();
  // hover 预览状态机：mouse enter 600ms 后才 mount <video>，离开立即销毁
  const [showPreview, setShowPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const extra =
    video.extraInfo && typeof video.extraInfo === "object" && !Array.isArray(video.extraInfo) ? video.extraInfo : null;
  const authorName = extra?.author || video.uploader.nickname || video.uploader.username;
  // 前台展示时间优先用过审时间，缺失则回退创建时间（存量数据与未过审记录走 createdAt 兜底）
  const displayTime = video.publishedAt ?? video.createdAt;
  // hover 视频预览：仅当上传时填入了 extraInfo.previewUrl 才启用 (后端切片产物)，
  // 没有 fallback 到原视频 (避免无意中播放完整视频的流量)
  const previewUrl: string | null = typeof extra?.previewUrl === "string" ? extra.previewUrl : null;

  const totalVotes = video._count.likes + (video._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((video._count.likes / totalVotes) * 100) : 100;
  const likeColor = likeRatio >= 90 ? "text-green-400" : likeRatio >= 70 ? "text-yellow-400" : "text-red-400";
  const commentCount = video._count.comments ?? 0;

  // 进度比例 0..1（仅当 duration 已知）。watchHistory 用 progress 字段（秒）
  const progressDuration = watchProgress?.duration ?? video.duration ?? null;
  const progressRatio =
    watchProgress && progressDuration && progressDuration > 0
      ? Math.min(1, Math.max(0, watchProgress.progress / progressDuration))
      : 0;
  const watched = progressRatio >= WATCHED_THRESHOLD;

  const handleMouseEnter = () => {
    play("hover");
    if (!previewUrl) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setShowPreview(true), 600);
  };
  const handleMouseLeave = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setShowPreview(false);
  };

  return (
    <div className="group" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <Link href={`/video/${video.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted shadow-[0_1px_2px_0_rgb(0_0_0_/_0.05)] group-hover:shadow-lg transition-shadow duration-300 ease-out">
          <VideoCover
            videoId={video.id}
            coverUrl={video.coverUrl}
            blurDataURL={video.coverBlurHash}
            title={video.title}
            preset="gridPrimary"
            // 仅首屏可见的前 2 张抢高优；过多 priority 会触发 next/image 自动 preload，
            // 导致首页一次性 preload 十几张大图，挤占 LCP 候选的带宽（PSI 实测 LCP 4.8s）。
            priority={index !== undefined && index < 2}
            className={cn(
              "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-105",
              watched && "grayscale opacity-70",
            )}
          />

          {/* hover 视频预览：覆盖在封面之上，桌面端启用 */}
          {previewUrl && showPreview && (
            <video
              className="hidden md:block absolute inset-0 w-full h-full object-cover z-[1]"
              src={previewUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-[2]" />

          {/* Play hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-250 ease-out">
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-3 shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95">
              <Play className="h-5 w-5 text-primary fill-primary" />
            </div>
          </div>

          {/* 排行榜徽章（前 3 名金/银/铜，其它显示数字） */}
          {rank !== undefined && <RankBadge rank={rank} />}

          {/* 左上：NEW（仅当未在排行榜场景下） */}
          {rank === undefined && <NewBadge createdAt={displayTime} />}

          {/* 时长徽章：避开左上角的 RankBadge / NewBadge */}
          {video.duration &&
            (() => {
              const hasTopLeftBadge = rank !== undefined || isNewlyUploaded(displayTime);
              return (
                <div
                  className={cn(
                    "absolute bg-black/75 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium tabular-nums",
                    hasTopLeftBadge ? "top-9 left-1.5" : "top-1.5 left-1.5",
                  )}
                >
                  {formatDuration(video.duration)}
                </div>
              );
            })()}

          {video.isNsfw && (
            <div className="absolute top-1.5 right-1.5 bg-red-500/90 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-bold">
              NSFW
            </div>
          )}

          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-2 text-[10px] sm:text-xs">
            <span className={`flex items-center gap-1 ${likeColor}`}>
              <ThumbsUp className="h-3 w-3" />
              {likeRatio}%
            </span>
            <span className="text-white/80">{formatViews(video.views)}次</span>
          </div>

          {/* 浮动快捷收藏按钮（hover 时浮出，desktop only） */}
          <VideoFavoriteFab videoId={video.id} isFavorited={isFavorited ?? false} />

          {/* 已看完角标 */}
          {watched && (
            <div className="absolute top-1.5 right-1.5 bg-green-500/95 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 shadow-sm">
              <Check className="h-3 w-3" />
              已看完
            </div>
          )}

          {/* 进度条：未看完且有进度时展示 */}
          {progressRatio > 0 && !watched && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(progressRatio * 100)}%` }}
                aria-label={`观看进度 ${Math.round(progressRatio * 100)}%`}
              />
            </div>
          )}
        </div>

        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200 ease-out">
            <SearchHighlightText text={video.title} highlightQuery={highlightQuery} />
          </h3>
          <CardMeta
            author={authorName}
            createdAt={displayTime}
            trailing={
              commentCount > 0 ? (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <MessageCircle className="h-3 w-3" aria-hidden />
                  {formatViews(commentCount)}
                </span>
              ) : null
            }
          />
        </div>
      </Link>
    </div>
  );
}

/** 视频卡片的浮动收藏按钮：用通用 HoverFavoriteButton，注入 video.favorite mutation */
function VideoFavoriteFab({ videoId, isFavorited }: { videoId: string; isFavorited: boolean }) {
  const utils = trpc.useUtils();
  const mutation = trpc.video.favorite.useMutation();
  return (
    <HoverFavoriteButton
      favorited={isFavorited}
      unauthCallbackUrl={`/video/${videoId}`}
      onToggle={async () => {
        const data = await mutation.mutateAsync({ videoId });
        void utils.video.favoritedMap.invalidate();
        return data.favorited;
      }}
    />
  );
}

export const VideoCard = memo(VideoCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.views === nextProps.video.views &&
    prevProps.video._count.likes === nextProps.video._count.likes &&
    (prevProps.video._count.comments ?? 0) === (nextProps.video._count.comments ?? 0) &&
    prevProps.index === nextProps.index &&
    prevProps.highlightQuery === nextProps.highlightQuery &&
    prevProps.rank === nextProps.rank &&
    prevProps.isFavorited === nextProps.isFavorited &&
    prevProps.watchProgress?.progress === nextProps.watchProgress?.progress &&
    prevProps.watchProgress?.duration === nextProps.watchProgress?.duration
  );
});
