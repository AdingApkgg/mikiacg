"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MotionPage } from "@/components/motion";
import { useSound } from "@/hooks/use-sound";
import { useThumb } from "@/hooks/use-thumb";
import { VideoCard } from "@/components/video/video-card";
import { ImagePostCard } from "@/components/image/image-post-card";
import { GameCard } from "@/components/game/game-card";
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
  Download,
  TrendingUp,
  Calendar,
  CalendarDays,
  Hash,
  Sparkles,
  Layers,
  type LucideIcon,
} from "lucide-react";

// ==================== 共享:排名徽章 / 格式化 ====================

type ContentType = "video" | "game" | "image";
type UserType = "uploader" | "points" | "commentator" | "collector" | "liker";
type Metric = "views" | "likes" | "favorites" | "comments" | "uploads" | "downloads";

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

const GAME_EXTRA_METRICS: { id: Metric; label: string; icon: LucideIcon }[] = [
  { id: "downloads", label: "下载", icon: Download },
];

function getContentHref(type: ContentType, id: string): string {
  if (type === "video") return `/video/${id}`;
  if (type === "game") return `/game/${id}`;
  return `/image/${id}`;
}

const METRIC_ICON_MAP: Record<Metric, LucideIcon> = {
  views: Eye,
  likes: Heart,
  favorites: Star,
  comments: MessageSquare,
  uploads: Upload,
  downloads: Download,
};

const USER_TYPE_ICON_MAP: Record<UserType, LucideIcon> = {
  points: Coins,
  uploader: Upload,
  commentator: MessageSquare,
  liker: Heart,
  collector: Star,
};

const RANK_COLORS = ["from-amber-500 to-yellow-400", "from-slate-400 to-slate-300", "from-amber-700 to-amber-600"];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div
        className={cn(
          "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0 shadow-sm",
          RANK_COLORS[rank - 1],
        )}
      >
        {rank === 1 ? <Crown className="h-4 w-4 text-white" /> : <Medal className="h-4 w-4 text-white" />}
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

// ==================== 内容排行(原 /ranking 内容排行子 Tab) ====================

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
  const microCover = useThumb("microThumb", 3 / 2);
  const Icon = METRIC_ICON_MAP[metric];
  const href = getContentHref(type, item.id);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-md hover:border-primary/20",
        rank <= 3 && "border-primary/10 bg-primary/[0.02]",
      )}
    >
      <RankBadge rank={rank} />

      {item.coverUrl && (
        <div className="w-14 h-10 rounded-lg overflow-hidden bg-muted shrink-0 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={microCover(item.coverUrl)} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", rank <= 3 ? "font-semibold" : "font-medium")}>{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Avatar className="h-4 w-4">
            <AvatarImage src={item.uploader.avatar || undefined} />
            <AvatarFallback className="text-[8px]">{item.uploader.name.charAt(0).toUpperCase()}</AvatarFallback>
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

function ContentRankingList({ contentType, metric }: { contentType: ContentType; metric: Metric }) {
  const { data, isLoading } = trpc.admin.getLeaderboard.useQuery(
    { type: contentType, metric, limit: 20 },
    { staleTime: 60_000 },
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
      {(
        data.items as {
          id: string;
          title: string;
          coverUrl: string | null;
          value: number;
          uploader: { id: string; name: string; avatar: string | null };
          stats: { views: number; likes: number; favorites: number; comments: number };
        }[]
      ).map((item, idx) => (
        <ContentRankItem key={item.id} rank={idx + 1} item={item} type={contentType} metric={metric} />
      ))}
    </div>
  );
}

function ContentRankingsSection() {
  const [contentType, setContentType] = useState<ContentType>("video");
  const [metric, setMetric] = useState<Metric>("views");
  const { play } = useSound();

  const currentContentTypeInfo = CONTENT_TYPES.find((t) => t.id === contentType);
  const currentMetricInfo = METRICS.find((m) => m.id === metric);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Tabs
          value={contentType}
          onValueChange={(v) => {
            const newType = v as ContentType;
            setContentType(newType);
            if (newType !== "game" && metric === "downloads") {
              setMetric("views");
            }
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
            {contentType === "game" &&
              GAME_EXTRA_METRICS.map((m) => (
                <TabsTrigger key={m.id} value={m.id} className="text-xs px-3 h-7 gap-1.5">
                  <m.icon className="h-3.5 w-3.5" />
                  {m.label}
                </TabsTrigger>
              ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-muted-foreground">
            {currentContentTypeInfo?.label} · {currentMetricInfo?.label}排行
          </h2>
          <Badge variant="secondary" className="text-[10px]">
            TOP 20
          </Badge>
        </div>

        <ContentRankingList contentType={contentType} metric={metric} />
      </div>
    </div>
  );
}

// ==================== 用户排行(原 /ranking 用户排行子 Tab) ====================

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
        rank <= 3 && "border-primary/10 bg-primary/[0.02]",
      )}
    >
      <RankBadge rank={rank} />

      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={item.avatar || undefined} />
        <AvatarFallback className="text-xs font-medium">{item.nickname.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", rank <= 3 ? "font-semibold" : "font-medium")}>{item.nickname}</p>
        {showBreakdown && (
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            {(("videos" in detail ? detail.videos : detail.video) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Video className="h-3 w-3" /> {"videos" in detail ? detail.videos : detail.video}
              </span>
            )}
            {(("games" in detail ? detail.games : detail.game) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Gamepad2 className="h-3 w-3" /> {"games" in detail ? detail.games : detail.game}
              </span>
            )}
            {(("images" in detail ? detail.images : detail.image) ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Images className="h-3 w-3" /> {"images" in detail ? detail.images : detail.image}
              </span>
            )}
          </div>
        )}
        {userType === "points" && <p className="text-[11px] text-muted-foreground mt-0.5">积分达人</p>}
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

function UserRankingList({ userType }: { userType: UserType }) {
  const metricForApi = userType === "uploader" ? ("uploads" as Metric) : ("views" as Metric);
  const { data, isLoading } = trpc.admin.getLeaderboard.useQuery(
    { type: userType, metric: metricForApi, limit: 20 },
    { staleTime: 60_000 },
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
      {(
        data.items as {
          userId: string;
          nickname: string;
          avatar: string | null;
          value: number;
          detail?: { videos: number; games: number; images: number };
          extra?: Record<string, unknown>;
        }[]
      ).map((item, idx) => (
        <UserRankItem key={item.userId} rank={idx + 1} item={item} userType={userType} />
      ))}
    </div>
  );
}

function UserRankingsSection() {
  const [userType, setUserType] = useState<UserType>("points");
  const { play } = useSound();

  const currentUserTypeInfo = USER_TYPES.find((t) => t.id === userType);

  return (
    <div className="max-w-3xl space-y-6">
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

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-muted-foreground">{currentUserTypeInfo?.label}排行</h2>
          <Badge variant="secondary" className="text-[10px]">
            TOP 20
          </Badge>
          {currentUserTypeInfo && (
            <span className="text-xs text-muted-foreground/60 hidden sm:inline">{currentUserTypeInfo.desc}</span>
          )}
        </div>

        <UserRankingList userType={userType} />
      </div>
    </div>
  );
}

// ==================== 热门排行(原 /rankings 周期榜单) ====================

type HotCategoryKey = "video" | "image" | "game" | "combined" | "tag";

type BaseCategoryKey =
  | "score_1d"
  | "score_7d"
  | "score_30d"
  | "surge"
  | "fav_period_7d"
  | "fav_period_30d"
  | "fav_total";
type CombinedCategoryKey = "score_1d" | "score_7d" | "score_30d";
type TagCategoryKey = "tag_hot" | "tag_surge";

interface BaseTabDef {
  key: BaseCategoryKey;
  label: string;
  icon: LucideIcon;
  category: "score" | "surge" | "fav_period" | "fav_total";
  period: "1d" | "7d" | "30d" | "all";
}

const BASE_TABS: BaseTabDef[] = [
  { key: "score_1d", label: "日榜", icon: Flame, category: "score", period: "1d" },
  { key: "score_7d", label: "周榜", icon: Calendar, category: "score", period: "7d" },
  { key: "score_30d", label: "月榜", icon: CalendarDays, category: "score", period: "30d" },
  { key: "surge", label: "飙升", icon: TrendingUp, category: "surge", period: "1d" },
  { key: "fav_period_7d", label: "周收藏", icon: Heart, category: "fav_period", period: "7d" },
  { key: "fav_period_30d", label: "月收藏", icon: Heart, category: "fav_period", period: "30d" },
  { key: "fav_total", label: "总收藏", icon: Star, category: "fav_total", period: "all" },
];

const COMBINED_TABS: Array<{
  key: CombinedCategoryKey;
  label: string;
  icon: LucideIcon;
  period: "1d" | "7d" | "30d";
}> = [
  { key: "score_1d", label: "日榜", icon: Flame, period: "1d" },
  { key: "score_7d", label: "周榜", icon: Calendar, period: "7d" },
  { key: "score_30d", label: "月榜", icon: CalendarDays, period: "30d" },
];

const TAG_TABS: Array<{ key: TagCategoryKey; label: string; icon: LucideIcon }> = [
  { key: "tag_hot", label: "热门标签", icon: Hash },
  { key: "tag_surge", label: "增长最快", icon: Sparkles },
];

const HOT_CATEGORY_TABS: { id: HotCategoryKey; label: string; icon: LucideIcon }[] = [
  { id: "video", label: "视频", icon: Video },
  { id: "image", label: "图集", icon: Images },
  { id: "game", label: "游戏", icon: Gamepad2 },
  { id: "combined", label: "综合", icon: Layers },
  { id: "tag", label: "标签", icon: Hash },
];

function EmptyState() {
  return (
    <div className="text-center text-muted-foreground py-16">
      <p>榜单暂未生成,请稍后再来。</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

function BaseContentList({
  contentType,
  category,
  period,
}: {
  contentType: "video" | "image" | "game";
  category: "score" | "surge" | "fav_period" | "fav_total";
  period: "1d" | "7d" | "30d" | "all";
}) {
  const { data, isLoading } = trpc.ranking.list.useQuery({
    contentType,
    category,
    period,
    limit: 50,
    offset: 0,
    excludeNsfw: true,
  });

  if (isLoading) return <GridSkeleton />;
  if (!data?.items.length) return <EmptyState />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.items.map((it) => {
        if (it.type === "video") return <VideoCard key={`v-${it.video.id}`} video={it.video} rank={it.rank} />;
        if (it.type === "image")
          return <ImagePostCard key={`i-${it.imagePost.id}`} post={it.imagePost} rank={it.rank} />;
        return <GameCard key={`g-${it.game.id}`} game={it.game} rank={it.rank} />;
      })}
    </div>
  );
}

function CombinedList({ period }: { period: "1d" | "7d" | "30d" }) {
  const { data, isLoading } = trpc.ranking.list.useQuery({
    contentType: "combined",
    category: "score",
    period,
    limit: 100,
    offset: 0,
    excludeNsfw: true,
  });

  if (isLoading) return <GridSkeleton />;
  if (!data?.items.length) return <EmptyState />;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.items.map((it) => {
        if (it.type === "video") return <VideoCard key={`v-${it.video.id}`} video={it.video} rank={it.rank} />;
        if (it.type === "image")
          return <ImagePostCard key={`i-${it.imagePost.id}`} post={it.imagePost} rank={it.rank} />;
        return <GameCard key={`g-${it.game.id}`} game={it.game} rank={it.rank} />;
      })}
    </div>
  );
}

function TagList({ category }: { category: "tag_hot" | "tag_surge" }) {
  const { data, isLoading } = trpc.ranking.tags.useQuery({ category, limit: 50, offset: 0 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }
  if (!data?.items.length) return <EmptyState />;

  return (
    <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {data.items.map((t) => (
        <li key={t.id}>
          <Link
            href={`/tags/${t.slug}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors"
          >
            <span className="w-6 text-center text-sm font-bold text-muted-foreground tabular-nums">{t.rank}</span>
            <Badge variant="secondary" className="font-medium">
              {t.name}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {category === "tag_hot" ? `${t.score} 内容` : `+${t.score}`}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function BaseContentSection({ contentType }: { contentType: "video" | "image" | "game" }) {
  const [sub, setSub] = useState<BaseCategoryKey>("score_1d");
  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as BaseCategoryKey)}>
      <TabsList className="mb-6 flex-wrap h-auto">
        {BASE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              <Icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {BASE_TABS.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          <BaseContentList contentType={contentType} category={t.category} period={t.period} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CombinedSection() {
  const [sub, setSub] = useState<CombinedCategoryKey>("score_1d");
  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as CombinedCategoryKey)}>
      <TabsList className="mb-6">
        {COMBINED_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              <Icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {COMBINED_TABS.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          <CombinedList period={t.period} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TagSection() {
  const [sub, setSub] = useState<TagCategoryKey>("tag_hot");
  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as TagCategoryKey)}>
      <TabsList className="mb-6">
        {TAG_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              <Icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {TAG_TABS.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          <TagList category={t.key} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function HotRankingsSection() {
  const [type, setType] = useState<HotCategoryKey>("video");
  const { play } = useSound();

  return (
    <Tabs
      value={type}
      onValueChange={(v) => {
        setType(v as HotCategoryKey);
        play("navigate");
      }}
    >
      <TabsList className="mb-6 flex-wrap h-auto">
        {HOT_CATEGORY_TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
            <t.icon className="h-4 w-4" />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="video">
        <BaseContentSection contentType="video" />
      </TabsContent>
      <TabsContent value="image">
        <BaseContentSection contentType="image" />
      </TabsContent>
      <TabsContent value="game">
        <BaseContentSection contentType="game" />
      </TabsContent>
      <TabsContent value="combined">
        <CombinedSection />
      </TabsContent>
      <TabsContent value="tag">
        <TagSection />
      </TabsContent>
    </Tabs>
  );
}

// ==================== 主页面 ====================

type TopTab = "hot" | "content" | "user";

const TOP_TABS: { id: TopTab; label: string; icon: LucideIcon }[] = [
  { id: "hot", label: "热门排行", icon: Flame },
  { id: "content", label: "内容排行", icon: Trophy },
  { id: "user", label: "用户排行", icon: Users },
];

export function RankingClient({ rankingEnabled }: { rankingEnabled: boolean }) {
  const defaultTab: TopTab = rankingEnabled ? "hot" : "content";
  const [top, setTop] = useState<TopTab>(defaultTab);
  const { play } = useSound();

  const visibleTabs = rankingEnabled ? TOP_TABS : TOP_TABS.filter((t) => t.id !== "hot");

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <MotionPage>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            排行榜
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {rankingEnabled ? "周期热门榜单、内容与用户排行" : "全站内容与用户排行"}
          </p>
        </div>
      </MotionPage>

      <Tabs
        value={top}
        onValueChange={(v) => {
          setTop(v as TopTab);
          play("navigate");
        }}
      >
        <MotionPage>
          <TabsList className="h-10 w-full sm:w-auto">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-1 sm:flex-initial text-sm px-5 h-8 gap-2">
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </MotionPage>

        <MotionPage>
          {rankingEnabled && (
            <TabsContent value="hot" className="mt-6">
              <HotRankingsSection />
            </TabsContent>
          )}
          <TabsContent value="content" className="mt-6">
            <ContentRankingsSection />
          </TabsContent>
          <TabsContent value="user" className="mt-6">
            <UserRankingsSection />
          </TabsContent>
        </MotionPage>
      </Tabs>
    </div>
  );
}
