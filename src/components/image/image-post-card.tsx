"use client";

import { memo } from "react";
import Link from "next/link";
import { Images, Eye } from "lucide-react";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { useSound } from "@/hooks/use-sound";
import { useTilt } from "@/hooks/use-tilt";

interface ImagePostCardProps {
  post: {
    id: string;
    title: string;
    description?: string | null;
    images: string[];
    views: number;
    createdAt: Date | string;
    uploader: {
      id: string;
      username: string;
      nickname?: string | null;
      avatar?: string | null;
    };
    tags?: { tag: { id: string; name: string; slug: string } }[];
  };
  index?: number;
}

function getImageProxyUrl(url: string): string {
  if (url.startsWith("/uploads/")) return url;
  return `/api/cover/${encodeURIComponent(url)}`;
}

function ImagePostCardComponent({ post, index = 0 }: ImagePostCardProps) {
  const { play } = useSound();
  const { ref: tiltRef, glareRef } = useTilt<HTMLDivElement>({
    maxTilt: 6,
    scale: 1.02,
    glareMaxOpacity: 0.1,
  });

  const imageUrls = (post.images ?? []) as string[];
  const previewImages = imageUrls.slice(0, 4);
  const imageCount = imageUrls.length;

  return (
    <div
      ref={tiltRef}
      className="group"
      style={{ animationDelay: `${index * 50}ms` }}
      onMouseEnter={() => play("hover")}
    >
      <Link href={`/image/${post.id}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300">
          {previewImages.length >= 4 ? (
            <div className="grid grid-cols-2 grid-rows-2 h-full gap-0.5">
              {previewImages.map((url, i) => (
                <div key={i} className="relative overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageProxyUrl(url)}
                    alt={`${post.title} - ${i + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : previewImages.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getImageProxyUrl(previewImages[0])}
              alt={post.title}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Images className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {imageCount > 1 && (
            <div className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
              <Images className="h-3 w-3" />
              {imageCount}
            </div>
          )}

          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 text-[10px] sm:text-xs text-white/80">
            <Eye className="h-3 w-3" />
            {formatViews(post.views)}
          </div>

          <div
            ref={glareRef}
            className="absolute inset-0 rounded-lg pointer-events-none opacity-0 transition-opacity duration-300 z-10"
          />
        </div>

        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200">
            {post.title}
          </h3>
          {post.description && (
            <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1">
              {post.description}
            </p>
          )}
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
            {post.uploader.nickname || post.uploader.username} · {formatRelativeTime(post.createdAt)}
          </p>
        </div>
      </Link>
    </div>
  );
}

export const ImagePostCard = memo(ImagePostCardComponent, (prev, next) => {
  return (
    prev.post.id === next.post.id &&
    prev.post.views === next.post.views &&
    prev.index === next.index
  );
});
