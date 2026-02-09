"use client";

import { memo } from "react";
import Link from "next/link";
import { VideoCover } from "./video-cover";
import { Play, ThumbsUp } from "lucide-react";
import { formatDuration, formatViews, formatRelativeTime } from "@/lib/format";

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    coverUrl?: string | null;
    duration?: number | null;
    views: number;
    createdAt: Date | string;
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
  };
  index?: number;
}

function VideoCardComponent({ video, index = 0 }: VideoCardProps) {
  const extra = video.extraInfo && typeof video.extraInfo === "object" && !Array.isArray(video.extraInfo) ? video.extraInfo : null;
  const authorName = extra?.author || video.uploader.nickname || video.uploader.username;

  // 好评率（hanime1 风格：thumb_up 百分比）
  const totalVotes = video._count.likes + (video._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((video._count.likes / totalVotes) * 100) : 100;
  const likeColor = likeRatio >= 90 ? "text-green-400" : likeRatio >= 70 ? "text-yellow-400" : "text-red-400";

  return (
    <div
      className="group transition-transform duration-300 hover:-translate-y-1"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <Link href={`/v/${video.id}`} className="block">
        {/* 封面 */}
        <div className="relative aspect-video overflow-hidden rounded-lg bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300">
          <VideoCover
            videoId={video.id}
            coverUrl={video.coverUrl}
            title={video.title}
            className="transition-transform duration-500 ease-out group-hover:scale-105"
          />

          {/* 底部渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* 播放按钮 hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-3 shadow-2xl transition-transform duration-200 group-hover:scale-110 active:scale-95">
              <Play className="h-5 w-5 text-primary fill-primary" />
            </div>
          </div>

          {/* 时长 - 左上角 */}
          {video.duration && (
            <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium tabular-nums">
              {formatDuration(video.duration)}
            </div>
          )}

          {/* 右下角：好评率 + 观看数（hanime1 风格） */}
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-2 text-[10px] sm:text-xs">
            <span className={`flex items-center gap-1 ${likeColor}`}>
              <ThumbsUp className="h-3 w-3" />
              {likeRatio}%
            </span>
            <span className="text-white/80">
              {formatViews(video.views)}次
            </span>
          </div>
        </div>

        {/* 标题 + 作者 · 时间 */}
        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200">
            {video.title}
          </h3>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
            {authorName} • {formatRelativeTime(video.createdAt)}
          </p>
        </div>
      </Link>
    </div>
  );
}

export const VideoCard = memo(VideoCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.views === nextProps.video.views &&
    prevProps.video._count.likes === nextProps.video._count.likes &&
    prevProps.index === nextProps.index
  );
});
