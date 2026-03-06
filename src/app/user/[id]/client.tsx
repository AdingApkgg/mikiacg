"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "@/components/video/video-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  Heart,
  Star,
  MapPin,
  Globe,
  ExternalLink,
  Mail,
  Clock,
  ThumbsUp,
  Play,
  Gamepad2,
  Images,
  LayoutGrid,
  Settings,
  Video,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSound } from "@/hooks/use-sound";
import type { SoundType } from "@/lib/audio";
import { GameCard, type GameCardData } from "@/components/game/game-card";
import { ImagePostCard } from "@/components/image/image-post-card";
import { FadeIn, CountUp } from "@/components/motion";
import type { SerializedUser } from "./page";

// ==================== 社交图标 ====================

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function PixivIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4.935 0A4.924 4.924 0 0 0 0 4.935v14.13A4.924 4.924 0 0 0 4.935 24h14.13A4.924 4.924 0 0 0 24 19.065V4.935A4.924 4.924 0 0 0 19.065 0zm7.81 4.547c2.181 0 4.058.676 5.399 1.847a6.118 6.118 0 0 1 2.116 4.66c.005 1.854-.88 3.476-2.257 4.563-1.375 1.092-3.225 1.697-5.258 1.697-2.314 0-4.46-.842-4.46-.842v2.718c.397.116 1.048.365.635.779H5.79c-.413-.414.204-.663.601-.779V7.666c-.397-.116-1.014-.365-.601-.779h2.28s1.593.842 3.676.842zm-.186 1.477c-1.283 0-2.34.287-3.176.664v7.853c.837.378 1.893.665 3.176.665 2.95 0 4.66-1.937 4.66-4.56 0-2.623-1.71-4.622-4.66-4.622z" />
    </svg>
  );
}

const SOCIAL_CONFIGS: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    getUrl: (value: string) => string;
    color: string;
  }
> = {
  twitter: {
    icon: TwitterIcon,
    getUrl: (v) => (v.startsWith("http") ? v : `https://twitter.com/${v.replace("@", "")}`),
    color: "hover:text-[#1DA1F2]",
  },
  github: {
    icon: GitHubIcon,
    getUrl: (v) => (v.startsWith("http") ? v : `https://github.com/${v}`),
    color: "hover:text-[#333] dark:hover:text-white",
  },
  discord: {
    icon: DiscordIcon,
    getUrl: (v) => (v.startsWith("http") ? v : `https://discord.com/users/${v}`),
    color: "hover:text-[#5865F2]",
  },
  youtube: {
    icon: YouTubeIcon,
    getUrl: (v) => (v.startsWith("http") ? v : `https://youtube.com/${v}`),
    color: "hover:text-[#FF0000]",
  },
  pixiv: {
    icon: PixivIcon,
    getUrl: (v) => (v.startsWith("http") ? v : `https://pixiv.net/users/${v}`),
    color: "hover:text-[#0096FA]",
  },
};

function SocialLinks({ socialLinks }: { socialLinks: Record<string, string> | null }) {
  if (!socialLinks) return null;
  return (
    <>
      {Object.entries(socialLinks).map(([key, value]) => {
        if (!value) return null;
        const config = SOCIAL_CONFIGS[key];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <a
            key={key}
            href={config.getUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-full bg-muted/50 transition-colors ${config.color}`}
            title={key.charAt(0).toUpperCase() + key.slice(1)}
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </>
  );
}

// ==================== 类型定义 ====================

type ContentZone = "all" | "video" | "image" | "game";
type VideoSubTab = "uploads" | "history" | "favorites" | "liked";
type GameSubTab = "uploads" | "history" | "favorites" | "liked";
type ImageSubTab = "posts" | "history" | "favorites" | "liked";

// ==================== 网格组件 ====================

function VideoGrid({
  videos,
  isLoading,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videos: any[];
  isLoading: boolean;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg" />
        ))}
      </div>
    );
  }
  if (videos.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {videos
        .filter((video) => video?.id != null)
        .map((video, index) => (
          <div key={video.id}>
            <VideoCard video={video} index={index} />
          </div>
        ))}
    </div>
  );
}

function GameGrid({
  games,
  isLoading,
  emptyTitle,
  emptyDescription,
}: {
  games: GameCardData[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-lg" />
        ))}
      </div>
    );
  }
  if (games.length === 0) {
    return <EmptyState icon={Gamepad2} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {games
        .filter((g) => g?.id != null)
        .map((game, index) => (
          <GameCard key={game.id} game={game} index={index} />
        ))}
    </div>
  );
}

function ImagePostGrid({
  posts,
  isLoading,
  emptyTitle,
  emptyDescription,
}: {
  posts: {
    id: string;
    title: string;
    description?: string | null;
    images: unknown;
    views: number;
    createdAt: Date | string;
    uploader: { id: string; username: string; nickname?: string | null; avatar?: string | null };
    tags?: { tag: { id: string; name: string; slug: string } }[];
  }[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }
  if (posts.length === 0) {
    return <EmptyState icon={Images} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {posts
        .filter((p) => p?.id != null)
        .map((post, index) => (
          <ImagePostCard key={post.id} post={post} index={index} />
        ))}
    </div>
  );
}

// ==================== 统计卡片 ====================

function StatItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-sm tabular-nums">
          <CountUp value={value} />
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

// ==================== 子 Tab 渲染器 ====================

function SubTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  play,
}: {
  tabs: { key: T; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  play: (sound: SoundType) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b mb-6 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => {
              onTabChange(tab.key);
              play("navigate");
            }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
            {tab.count != null && <span className="text-xs text-muted-foreground">({tab.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

// ==================== 综合概览区块 ====================

function OverviewSection({
  icon: Icon,
  title,
  count,
  onViewAll,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Icon className="h-4.5 w-4.5 text-primary" />
          {title}
          {count != null && count > 0 && (
            <Badge variant="secondary" className="text-xs font-normal ml-1">
              {count}
            </Badge>
          )}
        </h2>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1 h-8" onClick={onViewAll}>
          查看全部
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      {children}
    </section>
  );
}

// ==================== 主组件 ====================

interface UserPageClientProps {
  id: string;
  initialUser: SerializedUser | null;
  isOwnProfile: boolean;
}

export function UserPageClient({ id, initialUser, isOwnProfile: serverIsOwn }: UserPageClientProps) {
  const { data: session, status } = useSession();
  const { play } = useSound();
  const [activeZone, setActiveZone] = useState<ContentZone>("all");
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>("uploads");
  const [gameSubTab, setGameSubTab] = useState<GameSubTab>("uploads");
  const [imageSubTab, setImageSubTab] = useState<ImageSubTab>("posts");

  const [videoUploadsPage, setVideoUploadsPage] = useState(1);
  const [gameUploadsPage, setGameUploadsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [favPage, setFavPage] = useState(1);
  const [likedPage, setLikedPage] = useState(1);
  const [gameFavPage, setGameFavPage] = useState(1);
  const [gameLikedPage, setGameLikedPage] = useState(1);
  const [gameHistoryPage, setGameHistoryPage] = useState(1);
  const [imagePage, setImagePage] = useState(1);
  const [imageFavPage, setImageFavPage] = useState(1);
  const [imageLikedPage, setImageLikedPage] = useState(1);
  const [imageHistoryPage, setImageHistoryPage] = useState(1);

  const clientIsOwn = status === "authenticated" && session?.user?.id === id;
  const isOwnProfile = status === "loading" ? serverIsOwn : clientIsOwn;

  const { data: user, isLoading: userLoading } = trpc.user.getProfile.useQuery(
    { id },
    { staleTime: initialUser ? 60000 : 0, refetchOnMount: !initialUser }
  );

  const displayUser = user || initialUser;

  // ===== 综合概览查询（limit: 4）=====
  const isOverview = activeZone === "all";

  const { data: overviewVideos, isLoading: overviewVideosLoading } = trpc.user.getVideos.useQuery(
    { userId: id, limit: 4, page: 1 },
    { enabled: isOverview }
  );
  const { data: overviewImages, isLoading: overviewImagesLoading } = trpc.image.getUserPosts.useQuery(
    { userId: id, limit: 4, page: 1 },
    { enabled: isOverview }
  );
  const { data: overviewGames, isLoading: overviewGamesLoading } = trpc.user.getGames.useQuery(
    { userId: id, limit: 4, page: 1 },
    { enabled: isOverview }
  );

  // ===== 视频数据 =====
  const isVideoZone = activeZone === "video";

  const { data: uploadedVideos, isLoading: uploadedLoading } = trpc.user.getVideos.useQuery(
    { userId: id, limit: 20, page: videoUploadsPage },
    { enabled: isVideoZone && videoSubTab === "uploads" }
  );
  const { data: historyData, isLoading: historyLoading } = trpc.video.getUserHistory.useQuery(
    { userId: id, limit: 20, page: historyPage },
    { enabled: isVideoZone && videoSubTab === "history" }
  );
  const { data: favData, isLoading: favLoading } = trpc.video.getUserFavorites.useQuery(
    { userId: id, limit: 20, page: favPage },
    { enabled: isVideoZone && videoSubTab === "favorites" }
  );
  const { data: likedData, isLoading: likedLoading } = trpc.video.getUserLiked.useQuery(
    { userId: id, limit: 20, page: likedPage },
    { enabled: isVideoZone && videoSubTab === "liked" }
  );

  // ===== 游戏数据 =====
  const isGameZone = activeZone === "game";

  const { data: uploadedGames, isLoading: uploadedGamesLoading } = trpc.user.getGames.useQuery(
    { userId: id, limit: 20, page: gameUploadsPage },
    { enabled: isGameZone && gameSubTab === "uploads" }
  );
  const { data: gameHistoryData, isLoading: gameHistoryLoading } = trpc.game.getUserHistory.useQuery(
    { userId: id, limit: 20, page: gameHistoryPage },
    { enabled: isGameZone && gameSubTab === "history" }
  );
  const { data: gameFavData, isLoading: gameFavLoading } = trpc.game.getUserFavorites.useQuery(
    { userId: id, limit: 20, page: gameFavPage },
    { enabled: isGameZone && gameSubTab === "favorites" }
  );
  const { data: gameLikedData, isLoading: gameLikedLoading } = trpc.game.getUserLiked.useQuery(
    { userId: id, limit: 20, page: gameLikedPage },
    { enabled: isGameZone && gameSubTab === "liked" }
  );

  // ===== 图片数据 =====
  const isImageZone = activeZone === "image";

  const { data: imageData, isLoading: imageLoading } = trpc.image.getUserPosts.useQuery(
    { userId: id, limit: 20, page: imagePage },
    { enabled: isImageZone && imageSubTab === "posts" }
  );
  const { data: imageHistoryData, isLoading: imageHistoryLoading } = trpc.image.getUserHistory.useQuery(
    { userId: id, limit: 20, page: imageHistoryPage },
    { enabled: isImageZone && imageSubTab === "history" }
  );
  const { data: imageFavData, isLoading: imageFavLoading } = trpc.image.getUserFavorites.useQuery(
    { userId: id, limit: 20, page: imageFavPage },
    { enabled: isImageZone && imageSubTab === "favorites" }
  );
  const { data: imageLikedData, isLoading: imageLikedLoading } = trpc.image.getUserLiked.useQuery(
    { userId: id, limit: 20, page: imageLikedPage },
    { enabled: isImageZone && imageSubTab === "liked" }
  );

  // 用户不存在
  if (!initialUser && !displayUser && !userLoading) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">用户不存在</h1>
        <p className="text-muted-foreground mt-2">该用户可能已被删除或不存在</p>
        <Button asChild className="mt-4">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  if (!displayUser) {
    return (
      <div className="container py-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full max-w-md" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalLikes = displayUser._count.likes + displayUser._count.gameLikes + displayUser._count.imagePostLikes;
  const totalFavorites = displayUser._count.favorites + displayUser._count.gameFavorites + displayUser._count.imagePostFavorites;

  const zones: { key: ContentZone; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "all", label: "综合", icon: LayoutGrid },
    { key: "video", label: "视频", icon: Play },
    { key: "image", label: "图片", icon: Images },
    { key: "game", label: "游戏", icon: Gamepad2 },
  ];

  const videoTabs: { key: VideoSubTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "uploads", label: "作品", icon: Video, count: displayUser._count.videos },
    { key: "history", label: "观看记录", icon: Clock },
    { key: "favorites", label: "收藏", icon: Star, count: displayUser._count.favorites },
    { key: "liked", label: "喜欢", icon: ThumbsUp, count: displayUser._count.likes },
  ];

  const gameTabs: { key: GameSubTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "uploads", label: "作品", icon: Gamepad2, count: displayUser._count.games },
    { key: "history", label: "浏览记录", icon: Clock },
    { key: "favorites", label: "收藏", icon: Star, count: displayUser._count.gameFavorites },
    { key: "liked", label: "喜欢", icon: ThumbsUp, count: displayUser._count.gameLikes },
  ];

  const imageTabs: { key: ImageSubTab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "posts", label: "作品", icon: Images, count: displayUser._count.imagePosts },
    { key: "history", label: "浏览记录", icon: Clock },
    { key: "favorites", label: "收藏", icon: Star, count: displayUser._count.imagePostFavorites },
    { key: "liked", label: "喜欢", icon: ThumbsUp, count: displayUser._count.imagePostLikes },
  ];

  const switchToZone = (zone: ContentZone) => {
    setActiveZone(zone);
    play("navigate");
  };

  // ===== 综合概览渲染 =====
  const renderOverview = () => {
    const oVideos = overviewVideos?.videos ?? [];
    const oImages = overviewImages?.posts ?? [];
    const oGames = (overviewGames?.games ?? []) as GameCardData[];

    return (
      <div className="space-y-6">
        <OverviewSection
          icon={Play}
          title="视频作品"
          count={displayUser._count.videos}
          onViewAll={() => switchToZone("video")}
        >
          {overviewVideosLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          ) : oVideos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无视频作品</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {oVideos.map((video, index) => (
                <div key={video.id}>
                  <VideoCard video={video} index={index} />
                </div>
              ))}
            </div>
          )}
        </OverviewSection>

        <OverviewSection
          icon={Images}
          title="图片作品"
          count={displayUser._count.imagePosts}
          onViewAll={() => switchToZone("image")}
        >
          {overviewImagesLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : oImages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无图片作品</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {oImages.map((post, index) => (
                <ImagePostCard key={post.id} post={post} index={index} />
              ))}
            </div>
          )}
        </OverviewSection>

        <OverviewSection
          icon={Gamepad2}
          title="游戏作品"
          count={displayUser._count.games}
          onViewAll={() => switchToZone("game")}
        >
          {overviewGamesLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          ) : oGames.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">暂无游戏作品</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {oGames.map((game, index) => (
                <GameCard key={game.id} game={game} index={index} />
              ))}
            </div>
          )}
        </OverviewSection>
      </div>
    );
  };

  // ===== 视频内容 =====
  const renderVideoContent = () => (
    <>
      <SubTabs tabs={videoTabs} activeTab={videoSubTab} onTabChange={setVideoSubTab} play={play} />
      <div key={videoSubTab} className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both">
          {videoSubTab === "uploads" && (
            <>
              <VideoGrid
                videos={uploadedVideos?.videos ?? []}
                isLoading={uploadedLoading}
                emptyIcon={Video}
                emptyTitle="暂无视频作品"
                emptyDescription={isOwnProfile ? "你还没有上传过视频" : "该用户还没有上传过视频"}
              />
              <Pagination currentPage={videoUploadsPage} totalPages={uploadedVideos?.totalPages ?? 1} onPageChange={setVideoUploadsPage} className="mt-6" />
            </>
          )}
          {videoSubTab === "history" && (
            <>
              <VideoGrid
                videos={historyData?.history ?? []}
                isLoading={historyLoading}
                emptyIcon={Clock}
                emptyTitle="暂无观看记录"
                emptyDescription={isOwnProfile ? "你还没有观看过任何视频" : "该用户还没有观看过任何视频"}
              />
              <Pagination currentPage={historyPage} totalPages={historyData?.totalPages ?? 1} onPageChange={setHistoryPage} className="mt-6" />
            </>
          )}
          {videoSubTab === "favorites" && (
            <>
              <VideoGrid
                videos={favData?.favorites ?? []}
                isLoading={favLoading}
                emptyIcon={Star}
                emptyTitle="暂无收藏"
                emptyDescription={isOwnProfile ? "你还没有收藏过任何视频" : "该用户还没有收藏过任何视频"}
              />
              <Pagination currentPage={favPage} totalPages={favData?.totalPages ?? 1} onPageChange={setFavPage} className="mt-6" />
            </>
          )}
          {videoSubTab === "liked" && (
            <>
              <VideoGrid
                videos={likedData?.videos ?? []}
                isLoading={likedLoading}
                emptyIcon={ThumbsUp}
                emptyTitle="暂无喜欢"
                emptyDescription={isOwnProfile ? "你还没有点赞过任何视频" : "该用户还没有点赞过任何视频"}
              />
              <Pagination currentPage={likedPage} totalPages={likedData?.totalPages ?? 1} onPageChange={setLikedPage} className="mt-6" />
            </>
          )}
      </div>
    </>
  );

  // ===== 图片内容 =====
  const renderImageContent = () => (
    <>
      <SubTabs tabs={imageTabs} activeTab={imageSubTab} onTabChange={setImageSubTab} play={play} />
      <div key={imageSubTab} className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both">
          {imageSubTab === "posts" && (
            <>
              <ImagePostGrid
                posts={imageData?.posts ?? []}
                isLoading={imageLoading}
                emptyTitle="暂无作品"
                emptyDescription={isOwnProfile ? "你还没有发布过图片" : "该用户还没有发布过图片"}
              />
              <Pagination currentPage={imagePage} totalPages={imageData?.totalPages ?? 1} onPageChange={setImagePage} className="mt-6" />
            </>
          )}
          {imageSubTab === "history" && (
            <>
              <ImagePostGrid
                posts={imageHistoryData?.posts ?? []}
                isLoading={imageHistoryLoading}
                emptyTitle="暂无浏览记录"
                emptyDescription={isOwnProfile ? "你还没有浏览过任何图片" : "该用户还没有浏览过任何图片"}
              />
              <Pagination currentPage={imageHistoryPage} totalPages={imageHistoryData?.totalPages ?? 1} onPageChange={setImageHistoryPage} className="mt-6" />
            </>
          )}
          {imageSubTab === "favorites" && (
            <>
              <ImagePostGrid
                posts={imageFavData?.posts ?? []}
                isLoading={imageFavLoading}
                emptyTitle="暂无收藏"
                emptyDescription={isOwnProfile ? "你还没有收藏过任何图片" : "该用户还没有收藏过任何图片"}
              />
              <Pagination currentPage={imageFavPage} totalPages={imageFavData?.totalPages ?? 1} onPageChange={setImageFavPage} className="mt-6" />
            </>
          )}
          {imageSubTab === "liked" && (
            <>
              <ImagePostGrid
                posts={imageLikedData?.posts ?? []}
                isLoading={imageLikedLoading}
                emptyTitle="暂无喜欢"
                emptyDescription={isOwnProfile ? "你还没有点赞过任何图片" : "该用户还没有点赞过任何图片"}
              />
              <Pagination currentPage={imageLikedPage} totalPages={imageLikedData?.totalPages ?? 1} onPageChange={setImageLikedPage} className="mt-6" />
            </>
          )}
      </div>
    </>
  );

  // ===== 游戏内容 =====
  const renderGameContent = () => (
    <>
      <SubTabs tabs={gameTabs} activeTab={gameSubTab} onTabChange={setGameSubTab} play={play} />
      <div key={gameSubTab} className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both">
          {gameSubTab === "uploads" && (
            <>
              <GameGrid
                games={(uploadedGames?.games ?? []) as GameCardData[]}
                isLoading={uploadedGamesLoading}
                emptyTitle="暂无游戏作品"
                emptyDescription={isOwnProfile ? "你还没有上传过游戏" : "该用户还没有上传过游戏"}
              />
              <Pagination currentPage={gameUploadsPage} totalPages={uploadedGames?.totalPages ?? 1} onPageChange={setGameUploadsPage} className="mt-6" />
            </>
          )}
          {gameSubTab === "history" && (
            <>
              <GameGrid
                games={(gameHistoryData?.games ?? []) as GameCardData[]}
                isLoading={gameHistoryLoading}
                emptyTitle="暂无浏览记录"
                emptyDescription={isOwnProfile ? "你还没有浏览过任何游戏" : "该用户还没有浏览过任何游戏"}
              />
              <Pagination currentPage={gameHistoryPage} totalPages={gameHistoryData?.totalPages ?? 1} onPageChange={setGameHistoryPage} className="mt-6" />
            </>
          )}
          {gameSubTab === "favorites" && (
            <>
              <GameGrid
                games={(gameFavData?.games ?? []) as GameCardData[]}
                isLoading={gameFavLoading}
                emptyTitle="暂无收藏"
                emptyDescription={isOwnProfile ? "你还没有收藏过任何游戏" : "该用户还没有收藏过任何游戏"}
              />
              <Pagination currentPage={gameFavPage} totalPages={gameFavData?.totalPages ?? 1} onPageChange={setGameFavPage} className="mt-6" />
            </>
          )}
          {gameSubTab === "liked" && (
            <>
              <GameGrid
                games={(gameLikedData?.games ?? []) as GameCardData[]}
                isLoading={gameLikedLoading}
                emptyTitle="暂无喜欢"
                emptyDescription={isOwnProfile ? "你还没有点赞过任何游戏" : "该用户还没有点赞过任何游戏"}
              />
              <Pagination currentPage={gameLikedPage} totalPages={gameLikedData?.totalPages ?? 1} onPageChange={setGameLikedPage} className="mt-6" />
            </>
          )}
      </div>
    </>
  );

  const hasSocialLinks =
    displayUser.socialLinks &&
    typeof displayUser.socialLinks === "object" &&
    !Array.isArray(displayUser.socialLinks) &&
    Object.values(displayUser.socialLinks).some((v) => v);

  return (
    <div className="container py-6">
      {/* ===== 用户信息头部 ===== */}
      <FadeIn>
        <div className="rounded-2xl bg-gradient-to-br from-primary/5 via-primary/8 to-accent/5 border p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
              <AvatarImage src={displayUser.avatar || undefined} />
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold">{displayUser.nickname || displayUser.username}</h1>
                    {displayUser.pronouns && (
                      <Badge variant="secondary" className="text-xs">
                        {displayUser.pronouns}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">@{displayUser.username}</p>
                </div>
                {isOwnProfile && (
                  <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
                    <Link href="/settings">
                      <Settings className="h-3.5 w-3.5" />
                      编辑资料
                    </Link>
                  </Button>
                )}
              </div>

              {isOwnProfile && (
                <a
                  href={`mailto:${displayUser.email}`}
                  className="text-sm text-muted-foreground flex items-center gap-1 mt-1.5 hover:text-primary transition-colors w-fit"
                >
                  <Mail className="h-3 w-3" />
                  {displayUser.email}
                </a>
              )}

              {displayUser.bio && (
                <p className="mt-3 text-sm text-foreground/80 max-w-lg leading-relaxed">{displayUser.bio}</p>
              )}

              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
                {displayUser.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {displayUser.location}
                  </span>
                )}
                {displayUser.lastIpLocation && (
                  <span className="flex items-center gap-1" title="基于 IP 地址的大致位置">
                    <Globe className="h-3.5 w-3.5" />
                    IP 属地：{displayUser.lastIpLocation}
                  </span>
                )}
                {displayUser.website && (
                  <a
                    href={displayUser.website.startsWith("http") ? displayUser.website : `https://${displayUser.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {new URL(displayUser.website.startsWith("http") ? displayUser.website : `https://${displayUser.website}`).hostname}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatRelativeTime(displayUser.createdAt)} 加入
                </span>
              </div>

              {hasSocialLinks && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <SocialLinks socialLinks={displayUser.socialLinks as Record<string, string>} />
                </div>
              )}
            </div>
          </div>

          {/* 统计数据 */}
          <div className="flex items-center gap-2 mt-5 pt-5 border-t border-border/50 flex-wrap">
            <StatItem icon={Video} label="视频" value={displayUser._count.videos} />
            <StatItem icon={Images} label="图片" value={displayUser._count.imagePosts} />
            <StatItem icon={Gamepad2} label="游戏" value={displayUser._count.games} />
            <StatItem icon={Heart} label="获赞" value={totalLikes} />
            <StatItem icon={Star} label="收藏" value={totalFavorites} />
          </div>
        </div>
      </FadeIn>

      {/* ===== 分区 Tab ===== */}
      <FadeIn delay={0.05}>
        <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-none">
          {zones.map((zone) => {
            const Icon = zone.icon;
            return (
              <button
                key={zone.key}
                onClick={() => switchToZone(zone.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-[color,background-color,box-shadow] duration-200 ease-out whitespace-nowrap",
                  activeZone === zone.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {zone.label}
              </button>
            );
          })}
        </div>
      </FadeIn>

      {/* ===== 分区内容 ===== */}
      <FadeIn delay={0.1}>
        <div key={activeZone} className="animate-in fade-in slide-in-from-bottom-1 duration-200 fill-mode-both" style={{ animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
          {activeZone === "all" && renderOverview()}
          {activeZone === "video" && renderVideoContent()}
          {activeZone === "image" && renderImageContent()}
          {activeZone === "game" && renderGameContent()}
        </div>
      </FadeIn>
    </div>
  );
}
