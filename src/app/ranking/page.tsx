"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/motion";
import { useSound } from "@/hooks/use-sound";
import {
  Trophy,
  Eye,
  Heart,
  Star,
  MessageSquare,
  Video,
  Gamepad2,
  Images,
  Upload,
  Crown,
  Medal,
  Coins,
  Users,
  Flame,
  type LucideIcon,
} from "lucide-react";

// ==================== 类型定义 ====================

type ContentType = "video" | "game" | "image";
type UserType = "uploader" | "points" | "commentator" | "collector" | "liker";
type RankCategory = "content" | "user";
type Metric = "views" | "likes" | "favorites" | "comments" | "uploads";

const CONTENT_TYPES: { id: ContentType; label: string; icon: LucideIcon }[] = [
  { id: "video", label: "视频", icon: Video },
  { id: "game", label: "游戏", icon: Gamepad2 },
  { id: "image", label: "图片", icon: Images },
];

const USER_TYPES: { id: UserType; label: string; icon: LucideIcon; desc: string }[] = [
  { id: "points", label: "积分", icon: Coins, desc: "积分最多的用户" },
  { id: "uploader", label: "投稿", icon: Upload, desc: "投稿数量最多" },
  { id: "commentator", label: "评论", icon: MessageSquare, desc: "评论数量最多" },
  { id: "liker", label: "点赞", icon: Heart, desc: "点赞数量最多" },
  { id: "collector", label: "收藏", icon: Star, desc: "收藏数量最多" },
];

const METRICS: { id: Metric; label: string; icon: LucideIcon }[] = [
  { id: "views", label: "浏览", icon: Eye },
  { id: "likes", label: "点赞", icon: Heart },
  { id: "favorites", label: "收藏", icon: Star },
  { id: "comments", label: "评论", icon: MessageSquare },
];

function getContentHref(type: ContentType, id: string): string {
  if (type === "video") return `/video/${id}`;
  if (type === "game") return `/game/${id}`;
  return `/image/${id}`;
}

const METRIC_ICON_MAP: Record<Metric, LucideIcon> = {
  views: Eye, likes: Heart, favorites: Star, comments: MessageSquare, uploads: Upload,
};

const USER_TYPE_ICON_MAP: Record<UserType, LucideIcon> = {
  points: Coins, uploader: Upload, commentator: MessageSquare, liker: Heart, collector: Star,
};

// ==================== 排名徽章 ====================

const RANK_COLORS = [
  "from-amber-500 to-yellow-400",
  "from-slate-400 to-slate-300",
  "from-amber-700 to-amber-600",
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div
        className={cn(
          "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm",
          RANK_COLORS[rank - 1]
        )}
      >
        {rank === 1 ? (
          <Crown className="h-4 w-4 text-white" />
        ) : (
          <Medal className="h-4 w-4 text-white" />
        )}
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-muted-foreground tabular-nums">{rank}</span>
    </div>
  );
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 10_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString();
}

// ==================== 内容排名项 ====================

function ContentRankItem({
  rank,
  item,
  type,
  metric,
}: {
  rank: number;
  item: {
    id: string;
    title: string;
    coverUrl: string | null;
    value: number;
    uploader: { id: string; name: string; avatar: string | null };
    stats: { views: number; likes: number; favorites: number; comments: number };
  };
  type: ContentType;
  metric: Metric;
}) {
  const Icon = METRIC_ICON_MAP[metric];
  const href = getContentHref(type, item.id);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:border-primary/20",
        rank <= 3 && "border-primary/10 bg-primary/[0.02]"
      )}
    >
      <RankBadge rank={rank} />

      {item.coverUrl && (
        <div className="w-14 h-10 rounded-lg overflow-hidden bg-muted shrink-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cover/${encodeURIComponent(item.coverUrl)}?w=120&h=80&q=50`} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", rank <= 3 ? "font-semibold" : "font-medium")}>
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Avatar className="h-4 w-4">
            <AvatarImage src={item.uploader.avatar || undefined} />
            <AvatarFallback className="text-[8px]">
              {item.uploader.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground truncate">{item.uploader.name}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={cn("text-sm tabular-nums", rank <= 3 ? "font-bold" : "font-semibold")}>
          {formatValue(item.value)}
        </span>
      </div>
    </Link>
  );
}

// ==================== 用户排名项 ====================

function UserRankItem({
  rank,
  item,
  userType,
}: {
  rank: number;
  item: {
    userId: string;
    nickname: string;
    avatar: string | null;
    value: number;
    detail?: { videos: number; games: number; images: number };
    extra?: Record<string, unknown>;
  };
  userType: UserType;
}) {
  const Icon = USER_TYPE_ICON_MAP[userType];
  const detail = item.detail ?? (item.extra as { video?: number; game?: number; image?: number } | undefined);
  const showBreakdown = userType !== "points" && detail;

  return (
    <Link
      href={`/user/${item.userId}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:border-primary/20",
        rank <= 3 && "border-primary/10 bg-primary/[0.02]"
      )}
    >
      <RankBadge rank={rank} />

      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={item.avatar || undefined} />
        <AvatarFallback className="text-xs font-medium">
          {item.nickname.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", rank <= 3 ? "font-semibold" : "font-medium")}>
          {item.nickname}
        </p>
        {showBreakdown && (
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            {(('videos' in detail ? detail.videos : detail.video) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Video className="h-3 w-3" /> {'videos' in detail ? detail.videos : detail.video}
              </span>
            )}
            {(('games' in detail ? detail.games : detail.game) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Gamepad2 className="h-3 w-3" /> {'games' in detail ? detail.games : detail.game}
              </span>
            )}
            {(('images' in detail ? detail.images : detail.image) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Images className="h-3 w-3" /> {'images' in detail ? detail.images : detail.image}
              </span>
            )}
          </div>
        )}
        {userType === "points" && (
          <p className="text-[11px] text-muted-foreground mt-0.5">积分达人</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Icon className={cn("h-3.5 w-3.5", userType === "points" ? "text-amber-500" : "text-muted-foreground")} />
        <span className={cn("text-sm tabular-nums", rank <= 3 ? "font-bold" : "font-semibold")}>
          {formatValue(item.value)}
        </span>
      </div>
    </Link>
  );
}

// ==================== 排名列表 ====================

function ContentRankingList({
  contentType,
  metric,
}: {
  contentType: ContentType;
  metric: Metric;
}) {
  const { data, isLoading } = trpc.admin.getLeaderboard.useQuery(
    { type: contentType, metric, limit: 20 },
    { staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Trophy className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">暂无排名数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(data.items as { id: string; title: string; coverUrl: string | null; value: number; uploader: { id: string; name: string; avatar: string | null }; stats: { views: number; likes: number; favorites: number; comments: number } }[]).map(
        (item, idx) => (
          <ContentRankItem key={item.id} rank={idx + 1} item={item} type={contentType} metric={metric} />
        )
      )}
    </div>
  );
}

function UserRankingList({
  userType,
}: {
  userType: UserType;
}) {
  const metricForApi = userType === "uploader" ? "uploads" as Metric : "views" as Metric;
  const { data, isLoading } = trpc.admin.getLeaderboard.useQuery(
    { type: userType, metric: metricForApi, limit: 20 },
    { staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Users className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">暂无排名数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(data.items as { userId: string; nickname: string; avatar: string | null; value: number; detail?: { videos: number; games: number; images: number }; extra?: Record<string, unknown> }[]).map(
        (item, idx) => (
          <UserRankItem key={item.userId} rank={idx + 1} item={item} userType={userType} />
        )
      )}
    </div>
  );
}

// ==================== 主页面 ====================

export default function RankingPage() {
  const [category, setCategory] = useState<RankCategory>("content");
  const [contentType, setContentType] = useState<ContentType>("video");
  const [metric, setMetric] = useState<Metric>("views");
  const [userType, setUserType] = useState<UserType>("points");
  const { play } = useSound();

  const currentUserTypeInfo = USER_TYPES.find((t) => t.id === userType);
  const currentContentTypeInfo = CONTENT_TYPES.find((t) => t.id === contentType);
  const currentMetricInfo = METRICS.find((m) => m.id === metric);

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      {/* 标题 */}
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            排名榜
          </h1>
          <p className="text-muted-foreground text-sm mt-1">全站内容与用户排行</p>
        </div>
      </FadeIn>

      {/* 大类切换：内容排行 / 用户排行 */}
      <FadeIn delay={0.05}>
        <Tabs
          value={category}
          onValueChange={(v) => {
            setCategory(v as RankCategory);
            play("navigate");
          }}
        >
          <TabsList className="h-10 w-full sm:w-auto">
            <TabsTrigger value="content" className="flex-1 sm:flex-initial text-sm px-5 h-8 gap-2">
              <Flame className="h-4 w-4" />
              内容排行
            </TabsTrigger>
            <TabsTrigger value="user" className="flex-1 sm:flex-initial text-sm px-5 h-8 gap-2">
              <Users className="h-4 w-4" />
              用户排行
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </FadeIn>

      {/* 子类切换 */}
      <FadeIn delay={0.08}>
        {category === "content" ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Tabs
              value={contentType}
              onValueChange={(v) => {
                setContentType(v as ContentType);
                play("navigate");
              }}
            >
              <TabsList className="h-9">
                {CONTENT_TYPES.map((t) => (
                  <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 h-7 gap-1.5">
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Tabs
              value={metric}
              onValueChange={(v) => {
                setMetric(v as Metric);
                play("navigate");
              }}
            >
              <TabsList className="h-9">
                {METRICS.map((m) => (
                  <TabsTrigger key={m.id} value={m.id} className="text-xs px-3 h-7 gap-1.5">
                    <m.icon className="h-3.5 w-3.5" />
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : (
          <Tabs
            value={userType}
            onValueChange={(v) => {
              setUserType(v as UserType);
              play("navigate");
            }}
          >
            <TabsList className="h-9">
              {USER_TYPES.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="text-xs px-3 h-7 gap-1.5">
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </FadeIn>

      {/* 排名列表 */}
      <FadeIn delay={0.12}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-muted-foreground">
              {category === "content"
                ? `${currentContentTypeInfo?.label} · ${currentMetricInfo?.label}排行`
                : `${currentUserTypeInfo?.label}排行`}
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              TOP 20
            </Badge>
            {category === "user" && currentUserTypeInfo && (
              <span className="text-xs text-muted-foreground/60 hidden sm:inline">
                {currentUserTypeInfo.desc}
              </span>
            )}
          </div>

          {category === "content" ? (
            <ContentRankingList contentType={contentType} metric={metric} />
          ) : (
            <UserRankingList userType={userType} />
          )}
        </div>
      </FadeIn>
    </div>
  );
}
