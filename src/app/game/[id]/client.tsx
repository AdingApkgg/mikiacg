"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PageWrapper, FadeIn } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameCard } from "@/components/game/game-card";
import {
  Gamepad2, ThumbsUp, ThumbsDown, Heart, Eye, Download,
  Calendar, User, ExternalLink, Copy, Check, Info, Image as ImageIcon,
  Users, ChevronLeft, ChevronRight, Lock, Monitor, Smartphone, Play,
  Share2, X, MessageSquare, Tag, Edit,
} from "lucide-react";
import { GameVideoPlayer } from "@/components/game/game-video-player";
import { formatViews, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { GameCommentSection } from "@/components/comment/game-comment-section";
import { useSession } from "@/lib/auth-client";
import { useSound } from "@/hooks/use-sound";
import { toast } from "@/lib/toast-with-sound";
import type { SerializedGame } from "./page";
import type { GameExtraInfo } from "./page";

const GAME_TYPE_COLORS: Record<string, string> = {
  ADV: "bg-blue-500 text-white",
  SLG: "bg-purple-500 text-white",
  RPG: "bg-green-500 text-white",
  ACT: "bg-red-500 text-white",
  STG: "bg-orange-500 text-white",
  PZL: "bg-cyan-500 text-white",
  AVG: "bg-indigo-500 text-white",
  FTG: "bg-rose-500 text-white",
  TAB: "bg-amber-500 text-white",
  OTHER: "bg-gray-500 text-white",
};

const GAME_TYPE_LABELS: Record<string, string> = {
  ADV: "冒险", SLG: "策略", RPG: "角色扮演", ACT: "动作",
  STG: "射击", PZL: "解谜", AVG: "文字冒险", FTG: "格斗",
  TAB: "桌游", OTHER: "其他",
};

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-bold mb-3">
      <Icon className="h-4.5 w-4.5 text-primary" />
      {children}
    </h2>
  );
}

interface GamePageClientProps {
  id: string;
  initialGame: SerializedGame;
}

export function GamePageClient({ id, initialGame }: GamePageClientProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const { play } = useSound();
  const { data: session } = useSession();

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);
  const isOwner = hasMounted && session?.user?.id === initialGame.uploader.id;

  const extra: GameExtraInfo = (initialGame.extraInfo && typeof initialGame.extraInfo === "object")
    ? initialGame.extraInfo as GameExtraInfo
    : {};

  const { data: relatedGames } = trpc.game.getRelated.useQuery(
    { gameId: id, limit: 6 },
    { enabled: !!id }
  );

  const { data: interaction } = trpc.game.getUserInteraction.useQuery(
    { gameId: id },
    { enabled: !!id }
  );

  const utils = trpc.useUtils();

  const toggleReaction = trpc.game.toggleReaction.useMutation({
    onSuccess: () => {
      play("success");
      utils.game.getUserInteraction.invalidate({ gameId: id });
    },
  });
  const toggleFavorite = trpc.game.toggleFavorite.useMutation({
    onSuccess: () => {
      play("success");
      utils.game.getUserInteraction.invalidate({ gameId: id });
    },
  });

  const handleCopyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    play("click");
    setTimeout(() => setCopiedUrl(null), 2000);
  }, [play]);

  const handleShare = useCallback(async () => {
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
  }, []);

  const authorName = extra.originalAuthor || initialGame.uploader.nickname || initialGame.uploader.username;
  const imageUrls = extra.screenshots ?? [];
  const videoUrls = extra.videos ?? [];

  const hasScreenshots = imageUrls.length > 0;
  const hasVideos = videoUrls.length > 0;
  const hasDescription = !!initialGame.description;
  const hasCharacterIntro = !!extra.characterIntro;
  const hasDownloads = extra.downloads && extra.downloads.length > 0;
  const hasGameInfo = extra.originalName || extra.originalAuthor || extra.authorUrl || extra.fileSize || extra.platforms;

  const totalVotes = (initialGame._count.likes || 0) + (initialGame._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((initialGame._count.likes / totalVotes) * 100) : 100;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const coverSrc = initialGame.coverUrl
    ? (initialGame.coverUrl.startsWith("/uploads/")
      ? initialGame.coverUrl
      : `/api/cover/${encodeURIComponent(initialGame.coverUrl)}`)
    : null;

  return (
    <PageWrapper>
      {/* ==================== Hero 区域 ==================== */}
      <div className="relative overflow-hidden">
        {/* 模糊封面背景 */}
        <div className="absolute inset-0 -z-10">
          {coverSrc ? (
            <Image
              src={coverSrc}
              alt=""
              fill
              className="object-cover scale-110 blur-2xl opacity-30 dark:opacity-20"
              sizes="100vw"
              priority
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/5" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4 pb-6">
          {/* 返回 */}
          <FadeIn delay={0.05}>
            <Link
              href="/game"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ChevronLeft className="h-4 w-4" />
              返回游戏列表
            </Link>
          </FadeIn>

          {/* 封面 */}
          <FadeIn delay={0.1}>
            <div className="relative aspect-video max-w-3xl mx-auto rounded-xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
              {coverSrc ? (
                <Image
                  src={coverSrc}
                  alt={initialGame.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 768px"
                  priority
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
                  <Gamepad2 className="h-20 w-20 text-muted-foreground/30" />
                </div>
              )}

              {/* 封面 Badge */}
              <div className="absolute top-3 left-3 flex gap-2">
                {initialGame.gameType && (
                  <Badge className={cn("text-xs font-bold border-0 shadow-lg", GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER)}>
                    {initialGame.gameType}
                  </Badge>
                )}
                {initialGame.isFree && (
                  <Badge className="bg-green-500 text-white text-xs border-0 hover:bg-green-500 shadow-lg">
                    免费
                  </Badge>
                )}
              </div>

              {/* 截图预览覆盖 */}
              {hasScreenshots && (
                <button
                  onClick={() => openLightbox(0)}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors cursor-pointer group/cover"
                >
                  <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-3 shadow-2xl opacity-0 group-hover/cover:opacity-100 transition-all duration-200 scale-90 group-hover/cover:scale-100">
                    <ImageIcon className="h-5 w-5 text-primary" />
                  </div>
                </button>
              )}
            </div>
          </FadeIn>

          {/* 标题 + 统计 + 标签 + 操作 */}
          <FadeIn delay={0.15}>
            <div className="max-w-3xl mx-auto mt-5 space-y-3">
              {/* 标题 + 编辑 */}
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight">
                  {initialGame.title}
                </h1>
                {isOwner && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                    <Link href={`/game/edit/${id}`} aria-label="编辑游戏">
                      <Edit className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>

              {/* 内联统计 + 元信息 */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                {initialGame.gameType && (
                  <Badge className={cn("text-[10px] font-bold border-0 h-5", GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER)}>
                    {GAME_TYPE_LABELS[initialGame.gameType] || initialGame.gameType}
                  </Badge>
                )}
                {extra.platforms?.map((platform) => (
                  <Badge key={platform} variant="outline" className="gap-1 text-[10px] h-5">
                    {platform.toLowerCase().includes("android") ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                    {platform}
                  </Badge>
                ))}
                {initialGame.version && (
                  <Badge variant="outline" className="text-[10px] h-5">{initialGame.version}</Badge>
                )}
                <span className="text-muted-foreground/40 hidden sm:inline">|</span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" />
                  {formatViews(initialGame.views)}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  {initialGame._count.likes}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {initialGame._count.comments}
                </span>
              </div>

              {/* 上传者 + 时间 */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Link
                  href={`/user/${initialGame.uploader.id}`}
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  {authorName}
                </Link>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(initialGame.createdAt, "YYYY-MM-DD")}
                </span>
                {extra.fileSize && (
                  <span className="text-xs">{extra.fileSize}</span>
                )}
              </div>

              {/* 标签 */}
              {initialGame.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {initialGame.tags.map(({ tag }) => (
                    <Link key={tag.id} href={`/game/tag/${tag.slug}`}>
                      <Badge
                        variant="secondary"
                        className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                      >
                        {tag.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              {/* 好评率 */}
              {totalVotes > 0 && (
                <div className="space-y-1 max-w-xs">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{likeRatio}% 好评</span>
                    <span>{totalVotes} 个评价</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        likeRatio >= 80 ? "bg-green-500" : likeRatio >= 50 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${likeRatio}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 操作按钮行 — 桌面 */}
              <div className="hidden md:flex flex-wrap items-center gap-2 pt-1">
                {hasDownloads && (
                  <Button size="sm" className="gap-1.5" asChild>
                    <a href="#downloads">
                      <Download className="h-4 w-4" />
                      下载
                    </a>
                  </Button>
                )}
                <Button
                  variant={interaction?.liked ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  disabled={toggleReaction.isPending}
                  onClick={() => toggleReaction.mutate({ gameId: id, type: "like" })}
                >
                  <ThumbsUp className={cn("h-4 w-4", interaction?.liked && "fill-current")} />
                  {initialGame._count.likes || "赞"}
                </Button>
                <Button
                  variant={interaction?.disliked ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  disabled={toggleReaction.isPending}
                  onClick={() => toggleReaction.mutate({ gameId: id, type: "dislike" })}
                >
                  <ThumbsDown className={cn("h-4 w-4", interaction?.disliked && "fill-current")} />
                  踩
                </Button>
                <Button
                  variant={interaction?.favorited ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  disabled={toggleFavorite.isPending}
                  onClick={() => toggleFavorite.mutate({ gameId: id })}
                >
                  <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                  收藏
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  分享
                </Button>
              </div>

              {/* 操作按钮行 — 移动端 pill */}
              <div className="md:hidden overflow-x-auto scrollbar-hide -mx-4 px-4">
                <div className="flex items-center gap-2 min-w-max">
                  {hasDownloads && (
                    <a
                      href="#downloads"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                    >
                      <Download className="h-4 w-4" />
                      下载
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={toggleReaction.isPending}
                    onClick={() => toggleReaction.mutate({ gameId: id, type: "like" })}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      interaction?.liked ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <ThumbsUp className={cn("h-4 w-4", interaction?.liked && "fill-current")} />
                    {initialGame._count.likes || "赞"}
                  </button>
                  <button
                    type="button"
                    disabled={toggleReaction.isPending}
                    onClick={() => toggleReaction.mutate({ gameId: id, type: "dislike" })}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      interaction?.disliked ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <ThumbsDown className={cn("h-4 w-4", interaction?.disliked && "fill-current")} />
                    踩
                  </button>
                  <button
                    type="button"
                    disabled={toggleFavorite.isPending}
                    onClick={() => toggleFavorite.mutate({ gameId: id })}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                      interaction?.favorited ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                    收藏
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <Share2 className="h-4 w-4" />
                    分享
                  </button>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ==================== 主内容 — 可滚动分段 ==================== */}
      <div className="max-w-4xl mx-auto px-4 md:px-6">
        <Separator className="mb-6" />

        {/* 公告 */}
        {extra.notices && extra.notices.length > 0 && (
          <FadeIn delay={0.2}>
            <div className="space-y-2 mb-6">
              {extra.notices.map((notice, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-4 py-3 text-sm flex items-start gap-2",
                    notice.type === "warning" && "bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
                    notice.type === "error" && "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400",
                    notice.type === "success" && "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400",
                    notice.type === "info" && "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400",
                  )}
                >
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  {notice.content}
                </div>
              ))}
            </div>
          </FadeIn>
        )}

        {/* ——— 下载区 ——— */}
        {hasDownloads && (
          <FadeIn delay={0.2}>
            <section id="downloads" className="mb-8 scroll-mt-20">
              <SectionTitle icon={Download}>游戏下载</SectionTitle>
              <Card className="border-primary/20">
                <CardContent className="p-3 sm:p-4 space-y-2.5">
                  {extra.downloads!.map((dl, i) => (
                    <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 rounded-lg border bg-muted/30 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{dl.name}</p>
                        {dl.password && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3 shrink-0" />
                            <span>密码：</span>
                            <code className="bg-background px-1.5 py-0.5 rounded text-xs font-mono select-all border">
                              {dl.password}
                            </code>
                            <button
                              onClick={() => handleCopyUrl(dl.password!)}
                              className="text-primary hover:text-primary/80 transition-colors p-0.5"
                              aria-label="复制密码"
                            >
                              {copiedUrl === dl.password ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        )}
                      </div>
                      <Button size="sm" className="gap-1.5 shrink-0" asChild>
                        <a href={dl.url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                          下载
                        </a>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </FadeIn>
        )}

        {/* ——— 游戏介绍 ——— */}
        {hasDescription && (
          <FadeIn delay={0.25}>
            <section className="mb-8">
              <SectionTitle icon={Gamepad2}>游戏介绍</SectionTitle>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <Markdown content={initialGame.description!} />
                </CardContent>
              </Card>
            </section>
          </FadeIn>
        )}

        {/* ——— 游戏截图 ——— */}
        {hasScreenshots && (
          <FadeIn delay={0.3}>
            <section className="mb-8">
              <SectionTitle icon={ImageIcon}>
                游戏截图
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] ml-1">
                  {imageUrls.length}
                </Badge>
              </SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {imageUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => openLightbox(i)}
                    className="relative aspect-video rounded-lg overflow-hidden bg-muted group cursor-pointer ring-1 ring-border hover:ring-primary transition-all"
                  >
                    <Image
                      src={url}
                      alt={`${initialGame.title} 截图 ${i + 1}`}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, 33vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-full p-2">
                        <Eye className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* ——— PV / 游戏视频 ——— */}
        {hasVideos && (
          <FadeIn delay={0.3}>
            <section className="mb-8">
              <SectionTitle icon={Play}>PV 鉴赏</SectionTitle>
              <div className="space-y-4">
                {videoUrls.map((url, i) => (
                  <div key={i} className="rounded-xl overflow-hidden bg-black shadow-lg">
                    <GameVideoPlayer src={url} className="w-full aspect-video" />
                  </div>
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* ——— 角色介绍 ——— */}
        {hasCharacterIntro && (
          <FadeIn delay={0.3}>
            <section className="mb-8">
              <SectionTitle icon={Users}>角色介绍</SectionTitle>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <Markdown content={extra.characterIntro!} />
                </CardContent>
              </Card>
            </section>
          </FadeIn>
        )}

        {/* ——— 游戏信息 ——— */}
        {hasGameInfo && (
          <FadeIn delay={0.3}>
            <section className="mb-8">
              <SectionTitle icon={Info}>游戏信息</SectionTitle>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                    {extra.originalName && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">游戏原名</dt>
                        <dd className="text-sm font-medium">{extra.originalName}</dd>
                      </div>
                    )}
                    {extra.originalAuthor && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">原作者</dt>
                        <dd className="text-sm">{extra.originalAuthor}</dd>
                      </div>
                    )}
                    {extra.authorUrl && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">作者网址</dt>
                        <dd className="text-sm">
                          <a
                            href={extra.authorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1"
                          >
                            点击进入
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </dd>
                      </div>
                    )}
                    {extra.fileSize && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">文件大小</dt>
                        <dd className="text-sm">{extra.fileSize}</dd>
                      </div>
                    )}
                    {extra.platforms && extra.platforms.length > 0 && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">支持平台</dt>
                        <dd className="text-sm flex gap-1.5">
                          {extra.platforms.map((p) => (
                            <Badge key={p} variant="secondary" className="text-xs gap-1">
                              {p.toLowerCase().includes("android") ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                              {p}
                            </Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                    {initialGame.gameType && (
                      <div>
                        <dt className="text-xs text-muted-foreground mb-0.5">游戏类型</dt>
                        <dd className="text-sm">
                          <Badge className={cn("text-xs border-0", GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER)}>
                            {initialGame.gameType} · {GAME_TYPE_LABELS[initialGame.gameType] || "游戏"}
                          </Badge>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs text-muted-foreground mb-0.5">发布时间</dt>
                      <dd className="text-sm">{formatDate(initialGame.createdAt, "YYYY-MM-DD")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground mb-0.5">更新时间</dt>
                      <dd className="text-sm">{formatDate(initialGame.updatedAt, "YYYY-MM-DD")}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </section>
          </FadeIn>
        )}

        {/* ——— 相关推荐 ——— */}
        {relatedGames && relatedGames.length > 0 && (
          <FadeIn delay={0.35}>
            <section className="mb-8">
              <SectionTitle icon={Tag}>相关推荐</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {relatedGames.map((game: { id: string; title: string; description?: string | null; coverUrl?: string | null; gameType?: string | null; isFree: boolean; version?: string | null; views: number; createdAt: Date; extraInfo?: unknown; uploader: { id: string; username: string; nickname?: string | null; avatar?: string | null }; tags?: { tag: { id: string; name: string; slug: string } }[]; _count: { likes: number; dislikes?: number; favorites?: number } }, index: number) => (
                  <GameCard
                    key={game.id}
                    game={{ ...game, createdAt: game.createdAt.toString() }}
                    index={index}
                  />
                ))}
              </div>
            </section>
          </FadeIn>
        )}

        {/* ——— 评论区 ——— */}
        <FadeIn delay={0.4}>
          <section className="mb-8">
            <GameCommentSection gameId={id} />
          </section>
        </FadeIn>
      </div>

      {/* ==================== 截图灯箱 ==================== */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-5xl p-0 bg-black/95 border-0 overflow-hidden"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">截图预览</DialogTitle>
          <div className="relative">
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>

            {imageUrls.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2 transition-colors"
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2 transition-colors"
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
              </>
            )}

            <div className="flex items-center justify-center min-h-[50vh] max-h-[85vh]">
              {imageUrls[lightboxIndex] && (
                <Image
                  src={imageUrls[lightboxIndex]}
                  alt={`${initialGame.title} 截图 ${lightboxIndex + 1}`}
                  width={1920}
                  height={1080}
                  className="max-h-[85vh] w-auto object-contain"
                  unoptimized
                />
              )}
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white/80">
              {lightboxIndex + 1} / {imageUrls.length}
            </div>
          </div>

          {imageUrls.length > 1 && (
            <div className="flex gap-1.5 p-3 overflow-x-auto scrollbar-hide justify-center bg-black/50">
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setLightboxIndex(i)}
                  className={cn(
                    "relative w-16 h-10 rounded-md overflow-hidden bg-muted shrink-0 transition-all",
                    lightboxIndex === i ? "ring-2 ring-primary opacity-100" : "opacity-50 hover:opacity-80"
                  )}
                >
                  <Image src={url} alt={`截图 ${i + 1}`} fill className="object-cover" sizes="64px" unoptimized />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
