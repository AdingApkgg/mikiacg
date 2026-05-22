"use client";

import { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { MotionPage } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GameCard } from "@/components/game/game-card";
import {
  Gamepad2,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Eye,
  Download,
  Calendar,
  User,
  ExternalLink,
  Copy,
  Check,
  Info,
  Image as ImageIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  Lock,
  Monitor,
  Smartphone,
  Play,
  Share2,
  X,
  MessageSquare,
  Tag,
  Edit,
  Clock,
  HardDrive,
  ChevronDown,
} from "lucide-react";
import { GameVideoPlayer } from "@/components/game/game-video-player";
import { formatViews, formatDate } from "@/lib/format";
import { cn, getRedirectUrl } from "@/lib/utils";
import { useRedirectOptions } from "@/hooks/use-redirect-options";
import { GameCommentSection } from "@/components/comment/game-comment-section";
import { FileAttachmentPanel } from "@/components/files/file-attachment-panel";
import { useSession } from "@/lib/auth-client";
import { useShortcut } from "@/contexts/shortcut-registry";
import { useFingerprint } from "@/hooks/use-fingerprint";
import { useSound } from "@/hooks/use-sound";
import { useImageProxyUrl } from "@/hooks/use-cover-url";
import { toast, showPointsToast } from "@/lib/toast-with-sound";
import type { SerializedGame } from "./page";
import type { GameExtraInfo } from "./page";
import { getTabIcon } from "@/lib/game-tab-icons";

const GAME_TYPE_COLORS: Record<string, string> = {
  ADV: "bg-blue-500 text-white",
  SLG: "bg-purple-500 text-white",
  RPG: "bg-green-500 text-white",
  ACT: "bg-red-500 text-white",
  STG: "bg-orange-500 text-white",
  PZL: "bg-cyan-500 text-white",
  AVG: "bg-indigo-500 text-white",
  VN: "bg-fuchsia-500 text-white",
  FTG: "bg-rose-500 text-white",
  TAB: "bg-amber-500 text-white",
  OTHER: "bg-gray-500 text-white",
};

const GAME_TYPE_LABELS: Record<string, string> = {
  ADV: "冒险",
  SLG: "策略",
  RPG: "角色扮演",
  ACT: "动作",
  STG: "射击",
  PZL: "解谜",
  AVG: "文字冒险",
  VN: "视觉小说",
  FTG: "格斗",
  TAB: "桌游",
  OTHER: "其他",
};

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-base font-bold mb-3">
      <Icon className="h-4.5 w-4.5 text-primary" />
      {children}
    </h2>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground leading-none mb-1">{label}</dt>
        <dd className="font-medium leading-snug break-words">{children}</dd>
      </div>
    </div>
  );
}

function MobileInfoGrid({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</dt>
      <dd className="text-xs font-medium leading-snug truncate">{value}</dd>
    </div>
  );
}

interface GamePageClientProps {
  id: string;
  initialGame: SerializedGame;
  descriptionContent?: React.ReactNode;
  characterIntroContent?: React.ReactNode;
  versionContents?: Record<string, React.ReactNode>;
  customTabContents?: Record<string, React.ReactNode>;
}

export function GamePageClient({
  id,
  initialGame,
  descriptionContent,
  characterIntroContent,
  versionContents,
  customTabContents,
}: GamePageClientProps) {
  const redirectOpts = useRedirectOptions();
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false);
  const { play } = useSound();
  const { data: session } = useSession();
  const imageProxy = useImageProxyUrl();

  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const isOwner = hasMounted && session?.user?.id === initialGame.uploader.id;

  const extra: GameExtraInfo =
    initialGame.extraInfo && typeof initialGame.extraInfo === "object" ? (initialGame.extraInfo as GameExtraInfo) : {};

  const { data: relatedGames } = trpc.game.getRelated.useQuery({ gameId: id, limit: 6 }, { enabled: !!id });

  const { data: interaction } = trpc.game.getUserInteraction.useQuery({ gameId: id }, { enabled: !!id });

  const utils = trpc.useUtils();

  const toggleReaction = trpc.game.toggleReaction.useMutation({
    onSuccess: (data) => {
      play("like");
      showPointsToast(data?.pointsAwarded);
      utils.game.getUserInteraction.invalidate({ gameId: id });
    },
  });
  const toggleFavorite = trpc.game.toggleFavorite.useMutation({
    onSuccess: (data) => {
      play("favorite");
      showPointsToast(data?.pointsAwarded);
      utils.game.getUserInteraction.invalidate({ gameId: id });
    },
  });

  const incrementViews = trpc.game.incrementViews.useMutation();
  const { getVisitorId } = useFingerprint();
  const recordView = trpc.game.recordView.useMutation({
    onSuccess: (data) => showPointsToast(data?.pointsAwarded),
  });
  useEffect(() => {
    getVisitorId()
      .then((vid) => {
        if (vid) incrementViews.mutate({ id, visitorId: vid });
      })
      .catch(() => {});
    recordView.mutate({ gameId: id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCopyUrl = useCallback(
    (url: string) => {
      navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      play("click");
      setTimeout(() => setCopiedUrl(null), 2000);
    },
    [play],
  );

  useShortcut(
    () => {
      if (!session) return;
      toggleReaction.mutate({ gameId: id, type: "like" });
    },
    { combo: "l", description: "点赞", group: "互动", sound: null },
  );
  useShortcut(
    () => {
      if (!session) return;
      toggleFavorite.mutate({ gameId: id });
    },
    { combo: "c", description: "收藏", group: "互动", sound: null },
  );

  const trackDownload = trpc.game.trackDownload.useMutation();

  const handleDownloadClick = useCallback(
    (url: string) => {
      trackDownload.mutate({ gameId: id });
      window.open(getRedirectUrl(url, redirectOpts), "_blank", "noopener,noreferrer");
    },
    [id, trackDownload, redirectOpts],
  );

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
  const hasDownloads = extra.downloads && extra.downloads.length > 0;
  const hasVersions = initialGame.versions && initialGame.versions.length > 0;

  const totalVotes = (initialGame._count.likes || 0) + (initialGame._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((initialGame._count.likes / totalVotes) * 100) : 100;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const coverSrc = initialGame.coverUrl
    ? initialGame.coverUrl.startsWith("/uploads/")
      ? initialGame.coverUrl
      : imageProxy(initialGame.coverUrl)
    : null;

  const availableTabs = useMemo(() => {
    const tabs: {
      value: string;
      label: string;
      shortLabel: string;
      icon: React.ComponentType<{ className?: string }>;
      count?: number;
    }[] = [];
    if (hasScreenshots)
      tabs.push({
        value: "screenshots",
        label: "游戏截图",
        shortLabel: "截图",
        icon: ImageIcon,
        count: imageUrls.length,
      });
    if (descriptionContent) tabs.push({ value: "intro", label: "游戏介绍", shortLabel: "介绍", icon: Gamepad2 });
    if (hasVersions)
      tabs.push({
        value: "versions",
        label: "更新版本",
        shortLabel: "版本",
        icon: Tag,
        count: initialGame.versions.length,
      });
    if (hasVideos)
      tabs.push({ value: "videos", label: "PV 鉴赏", shortLabel: "PV", icon: Play, count: videoUrls.length });
    if (characterIntroContent) tabs.push({ value: "characters", label: "角色介绍", shortLabel: "角色", icon: Users });
    if (initialGame.customTabs && initialGame.customTabs.length > 0) {
      for (const ct of initialGame.customTabs) {
        if (customTabContents?.[ct.id]) {
          const shortLabel = ct.title.length > 3 ? ct.title.slice(0, 3) : ct.title;
          tabs.push({ value: `custom-${ct.id}`, label: ct.title, shortLabel, icon: getTabIcon(ct.icon) });
        }
      }
    }
    if (relatedGames && relatedGames.length > 0)
      tabs.push({ value: "related", label: "相关推荐", shortLabel: "推荐", icon: Tag, count: relatedGames.length });
    return tabs;
  }, [
    descriptionContent,
    hasScreenshots,
    hasVideos,
    hasVersions,
    characterIntroContent,
    imageUrls.length,
    videoUrls.length,
    initialGame.versions,
    initialGame.customTabs,
    customTabContents,
    relatedGames,
  ]);

  const defaultTab = availableTabs[0]?.value ?? "intro";

  const hasExtraInfo =
    extra.originalName ||
    extra.originalAuthor ||
    extra.authorUrl ||
    extra.fileSize ||
    extra.platforms ||
    initialGame.gameType ||
    initialGame.version;

  return (
    <MotionPage direction="none">
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

        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-4 sm:pb-6">
          {/* 返回 */}
          <MotionPage>
            <Link
              href="/game"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 sm:mb-4"
            >
              <ChevronLeft className="h-4 w-4" />
              返回游戏列表
            </Link>
          </MotionPage>

          {/* 封面 */}
          <MotionPage>
            <div className="relative aspect-video max-w-4xl mx-auto rounded-lg sm:rounded-xl overflow-hidden bg-muted shadow-2xl ring-1 ring-white/10">
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
                  <Gamepad2 className="h-16 w-16 sm:h-20 sm:w-20 text-muted-foreground/30" />
                </div>
              )}

              {/* 封面 Badge */}
              <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-1.5 sm:gap-2">
                {initialGame.gameType && (
                  <Badge
                    className={cn(
                      "text-[10px] sm:text-xs font-bold border-0 shadow-lg",
                      GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER,
                    )}
                  >
                    {initialGame.gameType}
                  </Badge>
                )}
                {initialGame.isFree && (
                  <Badge className="bg-green-500 text-white text-[10px] sm:text-xs border-0 hover:bg-green-500 shadow-lg">
                    免费
                  </Badge>
                )}
                {initialGame.isNsfw && (
                  <Badge className="bg-red-500 text-white text-[10px] sm:text-xs font-bold border-0 hover:bg-red-500 shadow-lg">
                    NSFW
                  </Badge>
                )}
              </div>

              {hasScreenshots && (
                <button
                  onClick={() => openLightbox(0)}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors cursor-pointer group/cover"
                >
                  <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-2.5 sm:p-3 shadow-2xl opacity-0 group-hover/cover:opacity-100 transition-all duration-200 scale-90 group-hover/cover:scale-100">
                    <ImageIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                </button>
              )}
            </div>
          </MotionPage>

          {/* 标题 + 统计 + 标签 + 操作 */}
          <MotionPage>
            <div className="max-w-4xl mx-auto mt-3 sm:mt-5 space-y-2 sm:space-y-3">
              {/* 标题 + 编辑 */}
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold leading-tight">
                  {initialGame.title}
                  {initialGame.isNsfw && (
                    <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0 hover:bg-red-500 border-0 font-bold align-middle">
                      NSFW
                    </Badge>
                  )}
                </h1>
                {isOwner && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shrink-0" asChild>
                    <Link href={`/game/edit/${id}`} aria-label="编辑游戏">
                      <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </Link>
                  </Button>
                )}
              </div>

              {/* 原名 */}
              {extra.originalName && <p className="text-xs sm:text-sm text-muted-foreground">{extra.originalName}</p>}

              {/* Badges 行 */}
              <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 sm:gap-y-1.5 text-sm text-muted-foreground">
                {initialGame.gameType && (
                  <Badge
                    className={cn(
                      "text-[10px] font-bold border-0 h-5",
                      GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER,
                    )}
                  >
                    {GAME_TYPE_LABELS[initialGame.gameType] || initialGame.gameType}
                  </Badge>
                )}
                {extra.platforms?.map((platform) => (
                  <Badge key={platform} variant="outline" className="gap-1 text-[10px] h-5">
                    {platform.toLowerCase().includes("android") ? (
                      <Smartphone className="h-3 w-3" />
                    ) : (
                      <Monitor className="h-3 w-3" />
                    )}
                    {platform}
                  </Badge>
                ))}
                {initialGame.version && (
                  <Badge variant="outline" className="text-[10px] h-5">
                    {initialGame.version}
                  </Badge>
                )}
              </div>

              {/* 统计数据 — 紧凑行 */}
              <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {formatViews(initialGame.views)}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {initialGame._count.likes}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {initialGame._count.favorites}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {initialGame._count.comments}
                </span>
                {initialGame.downloads > 0 && (
                  <span className="flex items-center gap-1">
                    <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    {formatViews(initialGame.downloads)}
                  </span>
                )}
                {/* 上传者 + 日期放在同一行 */}
                <span className="hidden sm:flex items-center gap-1 text-muted-foreground/60">|</span>
                <Link
                  href={`/user/${initialGame.uploader.id}`}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="max-w-[100px] truncate">{authorName}</span>
                </Link>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {formatDate(initialGame.createdAt, "YYYY-MM-DD")}
                </span>
              </div>

              {/* 标签 */}
              {initialGame.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 sm:gap-1.5">
                  {initialGame.tags.map(({ tag }) => (
                    <Link key={tag.id} href={`/game/tag/${tag.slug}`}>
                      <Badge
                        variant="secondary"
                        className="text-[10px] sm:text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
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
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                    <span>{likeRatio}% 好评</span>
                    <span>{totalVotes} 个评价</span>
                  </div>
                  <div className="h-1 sm:h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        likeRatio >= 80 ? "bg-green-500" : likeRatio >= 50 ? "bg-yellow-500" : "bg-red-500",
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
                  <ThumbsDown className={cn("h-4 w-4", interaction?.disliked && "fill-current")} />踩
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

              {/* 操作按钮行 — 移动端：等宽网格 */}
              <div className="md:hidden grid grid-cols-4 gap-1.5 pt-0.5">
                {hasDownloads ? (
                  <>
                    <a
                      href="#downloads"
                      className="flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium bg-primary text-primary-foreground active:scale-95 transition-transform"
                    >
                      <Download className="h-4 w-4" />
                      下载
                    </a>
                    <button
                      type="button"
                      disabled={toggleReaction.isPending}
                      onClick={() => toggleReaction.mutate({ gameId: id, type: "like" })}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                        interaction?.liked ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <ThumbsUp className={cn("h-4 w-4", interaction?.liked && "fill-current")} />
                      {initialGame._count.likes || "赞"}
                    </button>
                    <button
                      type="button"
                      disabled={toggleFavorite.isPending}
                      onClick={() => toggleFavorite.mutate({ gameId: id })}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                        interaction?.favorited ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                      收藏
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium bg-muted active:scale-95 transition-transform"
                    >
                      <Share2 className="h-4 w-4" />
                      分享
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={toggleReaction.isPending}
                      onClick={() => toggleReaction.mutate({ gameId: id, type: "like" })}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                        interaction?.liked ? "bg-primary text-primary-foreground" : "bg-muted",
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
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                        interaction?.disliked ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <ThumbsDown className={cn("h-4 w-4", interaction?.disliked && "fill-current")} />踩
                    </button>
                    <button
                      type="button"
                      disabled={toggleFavorite.isPending}
                      onClick={() => toggleFavorite.mutate({ gameId: id })}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                        interaction?.favorited ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                      收藏
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium bg-muted active:scale-95 transition-transform"
                    >
                      <Share2 className="h-4 w-4" />
                      分享
                    </button>
                  </>
                )}
              </div>
            </div>
          </MotionPage>
        </div>
      </div>

      {/* ==================== 主内容 — 双栏布局 ==================== */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
        <Separator className="mb-4 sm:mb-6" />

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
          {/* ——— 左侧主内容区 ——— */}
          <div className="flex-1 min-w-0">
            {/* 公告 */}
            {extra.notices && extra.notices.length > 0 && (
              <MotionPage>
                <div className="space-y-2 mb-4 sm:mb-6">
                  {extra.notices.map((notice, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm flex items-start gap-2",
                        notice.type === "warning" &&
                          "bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
                        notice.type === "error" &&
                          "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400",
                        notice.type === "success" &&
                          "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400",
                        notice.type === "info" &&
                          "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400",
                      )}
                    >
                      <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 mt-0.5 shrink-0" />
                      {notice.content}
                    </div>
                  ))}
                </div>
              </MotionPage>
            )}

            {/* 下载区 */}
            {hasDownloads && (
              <MotionPage>
                <section id="downloads" className="mb-4 sm:mb-6 scroll-mt-20">
                  <SectionTitle icon={Download}>游戏下载</SectionTitle>
                  <Card className="border-primary/20">
                    <CardContent className="p-2.5 sm:p-4 space-y-2">
                      {extra.downloads!.map((dl, i) => (
                        <div key={i} className="rounded-lg border bg-muted/30 p-2.5 sm:p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs sm:text-sm truncate">{dl.name}</p>
                              {dl.password && (
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] sm:text-xs text-muted-foreground">
                                  <Lock className="h-3 w-3 shrink-0" />
                                  <span>密码：</span>
                                  <code className="bg-background px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-mono select-all border">
                                    {dl.password}
                                  </code>
                                  <button
                                    onClick={() => handleCopyUrl(dl.password!)}
                                    className="text-primary hover:text-primary/80 transition-colors p-0.5"
                                    aria-label="复制密码"
                                  >
                                    {copiedUrl === dl.password ? (
                                      <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    ) : (
                                      <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* 桌面端按钮 */}
                            <Button
                              size="sm"
                              className="gap-1.5 shrink-0 hidden sm:inline-flex"
                              onClick={() => handleDownloadClick(dl.url)}
                            >
                              <Download className="h-4 w-4" />
                              下载
                            </Button>
                          </div>
                          {/* 移动端全宽按钮 */}
                          <Button
                            size="sm"
                            className="w-full gap-1.5 mt-2 sm:hidden"
                            onClick={() => handleDownloadClick(dl.url)}
                          >
                            <Download className="h-4 w-4" />
                            下载资源
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </section>
              </MotionPage>
            )}

            {/* 内容 Tabs */}
            {availableTabs.length > 0 && (
              <MotionPage>
                <Tabs defaultValue={defaultTab} className="mb-4 sm:mb-6">
                  {/* 移动端可横向滚动的 TabsList */}
                  <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
                    <TabsList variant="line" className="w-max sm:w-full justify-start mb-3 sm:mb-4">
                      {availableTabs.map((tab) => (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className="gap-1 sm:gap-1.5 text-xs sm:text-sm px-2 sm:px-3"
                        >
                          <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="sm:hidden">{tab.shortLabel}</span>
                          <span className="hidden sm:inline">{tab.label}</span>
                          {tab.count !== undefined && (
                            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5 hidden sm:flex">
                              {tab.count}
                            </Badge>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {/* 游戏介绍 */}
                  {descriptionContent && (
                    <TabsContent value="intro">
                      <Card>
                        <CardContent className="p-3 sm:p-6">{descriptionContent}</CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {/* 更新版本 */}
                  {hasVersions && (
                    <TabsContent value="versions">
                      <div className="space-y-1">
                        <Tabs defaultValue={initialGame.versions[0]?.id} className="w-full">
                          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                            <TabsList className="w-max justify-start h-auto flex-wrap gap-1 bg-transparent p-0 mb-3">
                              {initialGame.versions.map((ver) => (
                                <TabsTrigger
                                  key={ver.id}
                                  value={ver.id}
                                  className="text-xs px-3 py-1.5 rounded-full border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
                                >
                                  {ver.label}
                                </TabsTrigger>
                              ))}
                            </TabsList>
                          </div>
                          {initialGame.versions.map((ver) => (
                            <TabsContent key={ver.id} value={ver.id}>
                              <Card>
                                <CardContent className="p-3 sm:p-6">
                                  {versionContents?.[ver.id] || (
                                    <p className="text-sm text-muted-foreground">暂无版本描述</p>
                                  )}
                                </CardContent>
                              </Card>
                            </TabsContent>
                          ))}
                        </Tabs>
                      </div>
                    </TabsContent>
                  )}

                  {/* 游戏截图 */}
                  {hasScreenshots && (
                    <TabsContent value="screenshots">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-3">
                        {imageUrls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => openLightbox(i)}
                            className="relative aspect-video rounded-md sm:rounded-lg overflow-hidden bg-muted group cursor-pointer ring-1 ring-border hover:ring-primary transition-all active:scale-[0.98]"
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
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-full p-1.5 sm:p-2">
                                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {/* PV / 游戏视频 */}
                  {hasVideos && (
                    <TabsContent value="videos">
                      <div className="space-y-3 sm:space-y-4">
                        {videoUrls.map((url, i) => (
                          <div key={i} className="rounded-lg sm:rounded-xl overflow-hidden bg-black shadow-lg">
                            <GameVideoPlayer src={url} className="w-full aspect-video" />
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  )}

                  {/* 角色介绍 */}
                  {characterIntroContent && (
                    <TabsContent value="characters">
                      <Card>
                        <CardContent className="p-3 sm:p-6">{characterIntroContent}</CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {/* 自定义页面 */}
                  {initialGame.customTabs?.map((ct) =>
                    customTabContents?.[ct.id] ? (
                      <TabsContent key={ct.id} value={`custom-${ct.id}`}>
                        <Card>
                          <CardContent className="p-3 sm:p-6">{customTabContents[ct.id]}</CardContent>
                        </Card>
                      </TabsContent>
                    ) : null,
                  )}

                  {/* 相关推荐 */}
                  {relatedGames && relatedGames.length > 0 && (
                    <TabsContent value="related">
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                        {relatedGames.map(
                          (
                            game: {
                              id: string;
                              title: string;
                              description?: string | null;
                              coverUrl?: string | null;
                              gameType?: string | null;
                              isFree: boolean;
                              version?: string | null;
                              views: number;
                              createdAt: Date;
                              extraInfo?: unknown;
                              uploader: {
                                id: string;
                                username: string;
                                nickname?: string | null;
                                avatar?: string | null;
                              };
                              tags?: { tag: { id: string; name: string; slug: string } }[];
                              _count: { likes: number; dislikes?: number; favorites?: number };
                            },
                            index: number,
                          ) => (
                            <GameCard
                              key={game.id}
                              game={{ ...game, createdAt: game.createdAt.toString() }}
                              index={index}
                            />
                          ),
                        )}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </MotionPage>
            )}

            {/* 没有 tab 内容时直接显示各区块 */}
            {availableTabs.length === 0 && descriptionContent && (
              <MotionPage>
                <section className="mb-4 sm:mb-6">
                  <SectionTitle icon={Gamepad2}>游戏介绍</SectionTitle>
                  <Card>
                    <CardContent className="p-3 sm:p-6">{descriptionContent}</CardContent>
                  </Card>
                </section>
              </MotionPage>
            )}

            {/* 评论区 */}
            <MotionPage>
              <section className="mb-6 sm:mb-8">
                <GameCommentSection gameId={id} />
              </section>
            </MotionPage>

            {/* 附件资源 */}
            <MotionPage>
              <FileAttachmentPanel contentType="game" contentId={id} uploaderId={initialGame.uploader.id} />
            </MotionPage>
          </div>

          {/* ——— 右侧信息栏 ——— */}
          <aside className="lg:w-[280px] xl:w-[300px] shrink-0">
            <div className="lg:sticky lg:top-20 space-y-3 sm:space-y-4">
              {/* 移动端：紧凑可折叠游戏信息 */}
              {hasExtraInfo && (
                <MotionPage>
                  <Card className="lg:hidden">
                    <CardContent className="p-3">
                      <button
                        type="button"
                        onClick={() => setMobileInfoExpanded(!mobileInfoExpanded)}
                        className="w-full flex items-center justify-between text-sm font-bold"
                      >
                        <span className="flex items-center gap-1.5">
                          <Info className="h-4 w-4 text-primary" />
                          游戏信息
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            mobileInfoExpanded && "rotate-180",
                          )}
                        />
                      </button>

                      {/* 预览行：折叠时显示关键信息 */}
                      {!mobileInfoExpanded && (
                        <dl className="grid grid-cols-3 gap-2 mt-2.5 pt-2.5 border-t">
                          {initialGame.gameType && (
                            <MobileInfoGrid
                              label="类型"
                              value={
                                <Badge
                                  className={cn(
                                    "text-[9px] border-0 h-4 px-1",
                                    GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER,
                                  )}
                                >
                                  {GAME_TYPE_LABELS[initialGame.gameType] || initialGame.gameType}
                                </Badge>
                              }
                            />
                          )}
                          {extra.fileSize && <MobileInfoGrid label="大小" value={extra.fileSize} />}
                          {extra.originalAuthor && <MobileInfoGrid label="作者" value={extra.originalAuthor} />}
                          {!extra.fileSize && !extra.originalAuthor && (
                            <MobileInfoGrid label="发布" value={formatDate(initialGame.createdAt, "YYYY-MM-DD")} />
                          )}
                        </dl>
                      )}

                      {/* 展开内容 */}
                      {mobileInfoExpanded && (
                        <dl className="space-y-2.5 mt-2.5 pt-2.5 border-t">
                          {initialGame.gameType && (
                            <InfoRow icon={Gamepad2} label="游戏类型">
                              <Badge
                                className={cn(
                                  "text-xs border-0",
                                  GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER,
                                )}
                              >
                                {initialGame.gameType} · {GAME_TYPE_LABELS[initialGame.gameType] || "游戏"}
                              </Badge>
                            </InfoRow>
                          )}
                          {extra.originalName && (
                            <InfoRow icon={Tag} label="游戏原名">
                              {extra.originalName}
                            </InfoRow>
                          )}
                          {extra.originalAuthor && (
                            <InfoRow icon={User} label="原作者">
                              {extra.originalAuthor}
                            </InfoRow>
                          )}
                          {extra.authorUrl && (
                            <InfoRow icon={ExternalLink} label="作者网址">
                              <a
                                href={getRedirectUrl(extra.authorUrl, redirectOpts)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                              >
                                点击进入 <ExternalLink className="h-3 w-3" />
                              </a>
                            </InfoRow>
                          )}
                          {extra.fileSize && (
                            <InfoRow icon={HardDrive} label="文件大小">
                              {extra.fileSize}
                            </InfoRow>
                          )}
                          {extra.platforms && extra.platforms.length > 0 && (
                            <InfoRow icon={Monitor} label="支持平台">
                              <div className="flex flex-wrap gap-1">
                                {extra.platforms.map((p) => (
                                  <Badge key={p} variant="secondary" className="text-[10px] gap-1 h-5">
                                    {p.toLowerCase().includes("android") ? (
                                      <Smartphone className="h-3 w-3" />
                                    ) : (
                                      <Monitor className="h-3 w-3" />
                                    )}
                                    {p}
                                  </Badge>
                                ))}
                              </div>
                            </InfoRow>
                          )}
                          {initialGame.version && (
                            <InfoRow icon={Tag} label="版本">
                              {initialGame.version}
                            </InfoRow>
                          )}
                          <Separator />
                          <InfoRow icon={Calendar} label="发布时间">
                            {formatDate(initialGame.createdAt, "YYYY-MM-DD")}
                          </InfoRow>
                          <InfoRow icon={Clock} label="更新时间">
                            {formatDate(initialGame.updatedAt, "YYYY-MM-DD")}
                          </InfoRow>
                        </dl>
                      )}
                    </CardContent>
                  </Card>
                </MotionPage>
              )}

              {/* 桌面端：完整游戏信息卡 */}
              {hasExtraInfo && (
                <MotionPage>
                  <Card className="hidden lg:block">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
                        <Info className="h-4 w-4 text-primary" />
                        游戏信息
                      </h3>
                      <dl className="space-y-3">
                        {initialGame.gameType && (
                          <InfoRow icon={Gamepad2} label="游戏类型">
                            <Badge
                              className={cn(
                                "text-xs border-0",
                                GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER,
                              )}
                            >
                              {initialGame.gameType} · {GAME_TYPE_LABELS[initialGame.gameType] || "游戏"}
                            </Badge>
                          </InfoRow>
                        )}
                        {extra.originalName && (
                          <InfoRow icon={Tag} label="游戏原名">
                            {extra.originalName}
                          </InfoRow>
                        )}
                        {extra.originalAuthor && (
                          <InfoRow icon={User} label="原作者">
                            {extra.originalAuthor}
                          </InfoRow>
                        )}
                        {extra.authorUrl && (
                          <InfoRow icon={ExternalLink} label="作者网址">
                            <a
                              href={getRedirectUrl(extra.authorUrl, redirectOpts)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                            >
                              点击进入 <ExternalLink className="h-3 w-3" />
                            </a>
                          </InfoRow>
                        )}
                        {extra.fileSize && (
                          <InfoRow icon={HardDrive} label="文件大小">
                            {extra.fileSize}
                          </InfoRow>
                        )}
                        {extra.platforms && extra.platforms.length > 0 && (
                          <InfoRow icon={Monitor} label="支持平台">
                            <div className="flex flex-wrap gap-1">
                              {extra.platforms.map((p) => (
                                <Badge key={p} variant="secondary" className="text-[10px] gap-1 h-5">
                                  {p.toLowerCase().includes("android") ? (
                                    <Smartphone className="h-3 w-3" />
                                  ) : (
                                    <Monitor className="h-3 w-3" />
                                  )}
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          </InfoRow>
                        )}
                        {initialGame.version && (
                          <InfoRow icon={Tag} label="版本">
                            {initialGame.version}
                          </InfoRow>
                        )}
                        <Separator />
                        <InfoRow icon={Calendar} label="发布时间">
                          {formatDate(initialGame.createdAt, "YYYY-MM-DD")}
                        </InfoRow>
                        <InfoRow icon={Clock} label="更新时间">
                          {formatDate(initialGame.updatedAt, "YYYY-MM-DD")}
                        </InfoRow>
                      </dl>
                    </CardContent>
                  </Card>
                </MotionPage>
              )}

              {/* 上传者信息卡 */}
              <MotionPage>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <h3 className="text-xs sm:text-sm font-bold mb-2 sm:mb-3 flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                      上传者
                    </h3>
                    <Link
                      href={`/user/${initialGame.uploader.id}`}
                      className="flex items-center gap-2.5 sm:gap-3 group"
                    >
                      <div className="relative h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-muted shrink-0 ring-2 ring-border group-hover:ring-primary transition-colors">
                        {initialGame.uploader.avatar ? (
                          <Image
                            src={initialGame.uploader.avatar}
                            alt={authorName}
                            fill
                            className="object-cover"
                            sizes="40px"
                            unoptimized
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs sm:text-sm font-medium">
                            {(initialGame.uploader.nickname || initialGame.uploader.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {initialGame.uploader.nickname || initialGame.uploader.username}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">@{initialGame.uploader.username}</p>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              </MotionPage>

              {/* 关键词 */}
              {extra.keywords && extra.keywords.length > 0 && (
                <MotionPage>
                  <Card>
                    <CardContent className="p-3 sm:p-4">
                      <h3 className="text-xs sm:text-sm font-bold mb-2 sm:mb-3 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        关键词
                      </h3>
                      <div className="flex flex-wrap gap-1 sm:gap-1.5">
                        {extra.keywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] sm:text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </MotionPage>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ==================== 截图灯箱 ==================== */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          className="max-w-[100vw] sm:max-w-[90vw] lg:max-w-5xl p-0 bg-black/95 border-0 overflow-hidden sm:rounded-lg"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">截图预览</DialogTitle>
          <div className="relative">
            {/* 关闭按钮 — 移动端更大触摸区域 */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2.5 sm:p-2 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>

            {imageUrls.length > 1 && (
              <>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1))}
                  className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2.5 sm:p-2 transition-colors"
                  aria-label="上一张"
                >
                  <ChevronLeft className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={() => setLightboxIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0))}
                  className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-2.5 sm:p-2 transition-colors"
                  aria-label="下一张"
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
              </>
            )}

            <div className="flex items-center justify-center min-h-[40vh] sm:min-h-[50vh] max-h-[85vh]">
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

            <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white/80">
              {lightboxIndex + 1} / {imageUrls.length}
            </div>
          </div>

          {imageUrls.length > 1 && (
            <div className="flex gap-1 sm:gap-1.5 p-2 sm:p-3 overflow-x-auto scrollbar-hide justify-center bg-black/50">
              {imageUrls.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setLightboxIndex(i)}
                  className={cn(
                    "relative w-12 h-8 sm:w-16 sm:h-10 rounded-md overflow-hidden bg-muted shrink-0 transition-all",
                    lightboxIndex === i ? "ring-2 ring-primary opacity-100" : "opacity-50 hover:opacity-80",
                  )}
                >
                  <Image src={url} alt={`截图 ${i + 1}`} fill className="object-cover" sizes="64px" unoptimized />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MotionPage>
  );
}
