"use client";

import { useState } from "react";
import { ArrowLeft, Eye, Calendar, User, Images, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageWrapper, FadeIn } from "@/components/motion";
import { ImageViewer } from "@/components/image/image-viewer";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import type { SerializedImagePost } from "./page";

function getImageProxyUrl(url: string): string {
  if (url.startsWith("/uploads/")) return url;
  return `/api/cover/${encodeURIComponent(url)}`;
}

interface ImageDetailClientProps {
  post: SerializedImagePost;
}

export function ImageDetailClient({ post }: ImageDetailClientProps) {
  const { data: session } = useSession();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const imageUrls = post.images ?? [];
  const canEdit = session?.user?.id === post.uploader.id || session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <PageWrapper>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
        {/* Back button */}
        <FadeIn>
          <Link href="/image">
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 mb-4 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              图片列表
            </Button>
          </Link>
        </FadeIn>

        {/* Title & description */}
        <FadeIn delay={0.05}>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{post.title}</h1>
          {post.description && (
            <p className="text-muted-foreground text-sm sm:text-base mb-3 whitespace-pre-line">
              {post.description}
            </p>
          )}
        </FadeIn>

        {/* Meta info */}
        <FadeIn delay={0.1}>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {post.uploader.nickname || post.uploader.username}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" />
              {formatViews(post.views)} 次浏览
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatRelativeTime(post.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Images className="h-3.5 w-3.5" />
              {imageUrls.length} 张图片
            </span>
            {canEdit && (
              <Link href={`/image/edit/${post.id}`}>
                <Button variant="outline" size="sm" className="gap-1.5 h-7">
                  <Pencil className="h-3 w-3" />
                  编辑
                </Button>
              </Link>
            )}
          </div>
        </FadeIn>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <FadeIn delay={0.15}>
            <div className="flex flex-wrap gap-1.5 mb-6">
              {post.tags.map(({ tag }) => (
                <Link key={tag.id} href={`/tag/${tag.slug}`}>
                  <Badge variant="secondary" className="hover:bg-primary/10 transition-colors cursor-pointer">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </FadeIn>
        )}

        {/* Image grid — desktop 4 cols, mobile 2 cols */}
        <FadeIn delay={0.2}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {imageUrls.map((url, index) => (
              <button
                key={index}
                onClick={() => openViewer(index)}
                className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageProxyUrl(url)}
                  alt={`${post.title} - ${index + 1}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
        </FadeIn>

        {imageUrls.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Images className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">暂无图片</p>
          </div>
        )}
      </div>

      {/* Image viewer lightbox */}
      <ImageViewer
        images={imageUrls}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </PageWrapper>
  );
}
