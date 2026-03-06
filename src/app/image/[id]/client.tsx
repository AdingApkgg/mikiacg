"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { ArrowLeft, Eye, Calendar, User, Images, Pencil, ThumbsUp, ThumbsDown, Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageWrapper, FadeIn } from "@/components/motion";
import { ImageViewer } from "@/components/image/image-viewer";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { useSound } from "@/hooks/use-sound";
import { toast, showPointsToast } from "@/lib/toast-with-sound";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ImagePostCommentSection } from "@/components/comment/image-post-comment-section";
import type { SerializedImagePost } from "./page";

function getImageProxyUrl(url: string, thumb?: { w: number; q?: number }): string {
  if (!thumb && url.startsWith("/uploads/")) return url;
  const base = `/api/cover/${encodeURIComponent(url)}`;
  if (!thumb) return base;
  return `${base}?w=${thumb.w}&h=${thumb.w}&q=${thumb.q ?? 60}`;
}

interface ImageDetailClientProps {
  post: SerializedImagePost;
}

export function ImageDetailClient({ post }: ImageDetailClientProps) {
  const { data: session } = useSession();
  const { play } = useSound();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const imageUrls = post.images ?? [];

  const hasMounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const canEdit = hasMounted && (session?.user?.id === post.uploader.id || session?.user?.role === "ADMIN" || session?.user?.role === "OWNER");

  const { data: interaction } = trpc.image.getUserInteraction.useQuery(
    { imagePostId: post.id },
    { enabled: !!post.id }
  );

  const utils = trpc.useUtils();

  const toggleReaction = trpc.image.toggleReaction.useMutation({
    onSuccess: (data) => {
      play("like");
      showPointsToast(data?.pointsAwarded);
      utils.image.getUserInteraction.invalidate({ imagePostId: post.id });
    },
  });

  const toggleFavorite = trpc.image.toggleFavorite.useMutation({
    onSuccess: (data) => {
      play("favorite");
      showPointsToast(data?.pointsAwarded);
      utils.image.getUserInteraction.invalidate({ imagePostId: post.id });
    },
  });

  const incrementViews = trpc.image.incrementViews.useMutation();
  const recordView = trpc.image.recordView.useMutation({
    onSuccess: (data) => showPointsToast(data?.pointsAwarded),
  });
  useEffect(() => {
    incrementViews.mutate({ id: post.id });
    recordView.mutate({ imagePostId: post.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success("链接已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  const totalVotes = (post._count.likes || 0) + (post._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((post._count.likes / totalVotes) * 100) : 100;

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

        {/* 好评率 + 交互按钮 */}
        <FadeIn delay={0.12}>
          <div className="space-y-3 mb-6">
            {totalVotes > 0 && (
              <div className="space-y-1 max-w-xs">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{likeRatio}% 好评</span>
                  <span>{totalVotes} 个评价</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
                    style={{ width: `${likeRatio}%` }}
                  />
                </div>
              </div>
            )}

            {/* Desktop buttons */}
            <div className="hidden md:flex flex-wrap items-center gap-2">
              <Button
                variant={interaction?.liked ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => toggleReaction.mutate({ imagePostId: post.id, type: "like" })}
                disabled={toggleReaction.isPending}
              >
                <ThumbsUp className={cn("h-4 w-4", interaction?.liked && "fill-current")} />
                {post._count.likes || "赞"}
              </Button>
              <Button
                variant={interaction?.disliked ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => toggleReaction.mutate({ imagePostId: post.id, type: "dislike" })}
                disabled={toggleReaction.isPending}
              >
                <ThumbsDown className={cn("h-4 w-4", interaction?.disliked && "fill-current")} />
                踩
              </Button>
              <Button
                variant={interaction?.favorited ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => toggleFavorite.mutate({ imagePostId: post.id })}
                disabled={toggleFavorite.isPending}
              >
                <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                收藏
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
                分享
              </Button>
            </div>

            {/* Mobile buttons */}
            <div className="md:hidden overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 min-w-max">
                <button
                  onClick={() => toggleReaction.mutate({ imagePostId: post.id, type: "like" })}
                  disabled={toggleReaction.isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    interaction?.liked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <ThumbsUp className={cn("h-3.5 w-3.5", interaction?.liked && "fill-current")} />
                  {post._count.likes || "赞"}
                </button>
                <button
                  onClick={() => toggleReaction.mutate({ imagePostId: post.id, type: "dislike" })}
                  disabled={toggleReaction.isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    interaction?.disliked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <ThumbsDown className={cn("h-3.5 w-3.5", interaction?.disliked && "fill-current")} />
                  踩
                </button>
                <button
                  onClick={() => toggleFavorite.mutate({ imagePostId: post.id })}
                  disabled={toggleFavorite.isPending}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    interaction?.favorited ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Heart className={cn("h-3.5 w-3.5", interaction?.favorited && "fill-current")} />
                  收藏
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  分享
                </button>
              </div>
            </div>
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

        {/* Image grid */}
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
                  src={getImageProxyUrl(url, { w: 400, q: 70 })}
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

      {/* 评论区 */}
      <FadeIn delay={0.3}>
        <section className="mt-8 mb-8">
          <ImagePostCommentSection imagePostId={post.id} />
        </section>
      </FadeIn>

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
