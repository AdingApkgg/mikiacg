"use client";

import { memo } from "react";
import Link from "next/link";
import { VideoCover } from "./video-cover";
import { Play, ThumbsUp } from "lucide-react";
import { formatDuration, formatViews, formatRelativeTime } from "@/lib/format";
import { useSound } from "@/hooks/use-sound";
import { useTilt } from "@/hooks/use-tilt";

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    coverUrl?: string | null;
    coverBlurHash?: string | null;
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
  const { play } = useSound();
  const { ref: tiltRef, glareRef } = useTilt<HTMLDivElement>({
    maxTilt: 8,
    scale: 1.03,
    glareMaxOpacity: 0.12,
  });

  const extra = video.extraInfo && typeof video.extraInfo === "object" && !Array.isArray(video.extraInfo) ? video.extraInfo : null;
  const authorName = extra?.author || video.uploader.nickname || video.uploader.username;

  const totalVotes = video._count.likes + (video._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((video._count.likes / totalVotes) * 100) : 100;
  const likeColor = likeRatio >= 90 ? "text-green-400" : likeRatio >= 70 ? "text-yellow-400" : "text-red-400";

  return (
    <div
      ref={tiltRef}
      className="group"
      style={{ animationDelay: `${index * 50}ms` }}
      onMouseEnter={() => play("hover")}
    >
      <Link href={`/video/${video.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300 ease-out">
          <VideoCover
            videoId={video.id}
            coverUrl={video.coverUrl}
            blurDataURL={video.coverBlurHash}
            title={video.title}
            thumbWidth={480}
            className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-105"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Play hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-250 ease-out">
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-3 shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95">
              <Play className="h-5 w-5 text-primary fill-primary" />
            </div>
          </div>

          {video.duration && (
            <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium tabular-nums">
              {formatDuration(video.duration)}
            </div>
          )}

          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-2 text-[10px] sm:text-xs">
            <span className={`flex items-center gap-1 ${likeColor}`}>
              <ThumbsUp className="h-3 w-3" />
              {likeRatio}%
            </span>
            <span className="text-white/80">
              {formatViews(video.views)}次
            </span>
          </div>

          {/* Tilt glare overlay */}
          <div
            ref={glareRef}
            className="absolute inset-0 rounded-lg pointer-events-none opacity-0 transition-opacity duration-300 z-10"
          />
        </div>

        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200 ease-out">
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
