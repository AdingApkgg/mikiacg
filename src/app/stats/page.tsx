"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSound } from "@/hooks/use-sound";
import {
  Users,
  Video,
  Tag,
  Eye,
  Heart,
  Star,
  TrendingUp,
  MessageSquare,
  ArrowUpRight,
  Gamepad2,
  Images,
  Layers,
  Search,
  type LucideIcon,
} from "lucide-react";
import { FadeIn, CountUp } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

const RANGE_OPTIONS = [
  { value: 1, label: "24h" },
  { value: 7, label: "7天" },
  { value: 30, label: "30天" },
] as const;

const TREND_RANGE_OPTIONS = [
  { value: 7, label: "7天" },
  { value: 14, label: "14天" },
  { value: 30, label: "30天" },
] as const;

function formatCompact(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 10_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

// ==================== 核心指标卡片 ====================

function HeroStat({
  icon: Icon,
  label,
  value,
  color,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  isLoading: boolean;
}) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", ring: "ring-blue-500/20" },
    green: { bg: "bg-green-500/10", text: "text-green-500", ring: "ring-green-500/20" },
    violet: { bg: "bg-violet-500/10", text: "text-violet-500", ring: "ring-violet-500/20" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500", ring: "ring-amber-500/20" },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <div className={cn("relative rounded-2xl border p-5 transition-shadow hover:shadow-md", c.ring, "ring-1")}>
      <div className={cn("inline-flex p-2.5 rounded-xl mb-3", c.bg)}>
        <Icon className={cn("h-5 w-5", c.text)} />
      </div>
      <div>
        {isLoading ? (
          <Skeleton className="h-8 w-20 mb-1" />
        ) : (
          <p className="text-3xl font-bold tracking-tight tabular-nums">
            <CountUp value={value} />
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ==================== 互动指标行 ====================

function EngagementRow({
  items,
  isLoading,
}: {
  items: { icon: LucideIcon; label: string; value: number; color: string }[];
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
          <div className={cn("p-2 rounded-lg shrink-0", item.color.replace("text-", "bg-").replace("500", "500/10"))}>
            <item.icon className={cn("h-4 w-4", item.color)} />
          </div>
          <div className="min-w-0">
            {isLoading ? (
              <Skeleton className="h-5 w-12 mb-1" />
            ) : (
              <p className="text-lg font-bold tabular-nums leading-tight">
                <CountUp value={item.value} />
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== 内容分布饼图 ====================

const contentPieConfig = {
  count: { label: "数量" },
  videos: { label: "视频", color: "hsl(142, 71%, 45%)" },
  images: { label: "图片", color: "hsl(263, 70%, 50%)" },
  games: { label: "游戏", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig;

function ContentDistributionChart({
  videoCount,
  imagePostCount,
  gameCount,
  isLoading,
}: {
  videoCount: number;
  imagePostCount: number;
  gameCount: number;
  isLoading: boolean;
}) {
  const data = useMemo(
    () => [
      { name: "videos", value: videoCount, fill: "var(--color-videos)" },
      { name: "images", value: imagePostCount, fill: "var(--color-images)" },
      { name: "games", value: gameCount, fill: "var(--color-games)" },
    ],
    [videoCount, imagePostCount, gameCount]
  );

  const total = videoCount + imagePostCount + gameCount;

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">内容分布</h3>
      <ChartContainer config={contentPieConfig} className="mx-auto aspect-square max-h-[220px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={2} stroke="hsl(var(--background))">
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
          <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-2xl font-bold">
            {formatCompact(total)}
          </text>
          <text x="50%" y="60%" textAnchor="middle" dominantBaseline="central" className="fill-muted-foreground text-xs">
            总内容
          </text>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
    </div>
  );
}

// ==================== 分区互动柱状图 ====================

const zoneBarConfig = {
  views: { label: "浏览", color: "hsl(25, 95%, 53%)" },
  likes: { label: "点赞", color: "hsl(0, 84%, 60%)" },
  favorites: { label: "收藏", color: "hsl(48, 96%, 53%)" },
  comments: { label: "评论", color: "hsl(187, 85%, 53%)" },
} satisfies ChartConfig;

function ZoneEngagementChart({
  stats,
  isLoading,
}: {
  stats:
    | {
        video: { likes: number; dislikes: number; favorites: number; comments: number };
        game: { likes: number; dislikes: number; favorites: number; comments: number };
        image: { likes: number; dislikes: number; favorites: number; comments: number };
        videoViews: number;
        gameViews: number;
        imageViews: number;
      }
    | undefined;
  isLoading: boolean;
}) {
  const data = useMemo(() => {
    if (!stats) return [];
    return [
      {
        zone: "视频",
        views: stats.videoViews,
        likes: stats.video.likes,
        favorites: stats.video.favorites,
        comments: stats.video.comments,
      },
      {
        zone: "图片",
        views: stats.imageViews,
        likes: stats.image.likes,
        favorites: stats.image.favorites,
        comments: stats.image.comments,
      },
      {
        zone: "游戏",
        views: stats.gameViews,
        likes: stats.game.likes,
        favorites: stats.game.favorites,
        comments: stats.game.comments,
      },
    ];
  }, [stats]);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">分区互动对比</h3>
      <ChartContainer config={zoneBarConfig} className="h-[220px] w-full">
        <BarChart data={data} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="zone" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={45} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="views" fill="var(--color-views)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="likes" fill="var(--color-likes)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="favorites" fill="var(--color-favorites)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="comments" fill="var(--color-comments)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ==================== 增长趋势面积图 ====================

const TREND_METRICS = [
  { key: "content", label: "内容", fields: ["users", "videos", "images", "games"] },
  { key: "engagement", label: "互动", fields: ["views", "likes", "favorites", "comments"] },
] as const;

const trendConfig = {
  users: { label: "用户", color: "hsl(217, 91%, 60%)" },
  videos: { label: "视频", color: "hsl(142, 71%, 45%)" },
  images: { label: "图片", color: "hsl(263, 70%, 50%)" },
  games: { label: "游戏", color: "hsl(38, 92%, 50%)" },
  views: { label: "浏览", color: "hsl(25, 95%, 53%)" },
  likes: { label: "点赞", color: "hsl(0, 84%, 60%)" },
  favorites: { label: "收藏", color: "hsl(48, 96%, 53%)" },
  comments: { label: "评论", color: "hsl(187, 85%, 53%)" },
} satisfies ChartConfig;

function GrowthTrendChart({
  days,
  onDaysChange,
}: {
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const { play } = useSound();
  const [metricGroup, setMetricGroup] = useState<"content" | "engagement">("content");
  const { data: trend, isLoading } = trpc.admin.getGrowthTrend.useQuery({ days });

  const activeFields = TREND_METRICS.find((m) => m.key === metricGroup)!.fields;

  const chartData = useMemo(() => {
    if (!trend) return [];
    return trend.map((d) => ({
      ...d,
      label: d.date.slice(5),
    }));
  }, [trend]);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          每日增长趋势
        </h3>
        <div className="flex items-center gap-2">
          <Tabs
            value={metricGroup}
            onValueChange={(v) => {
              setMetricGroup(v as "content" | "engagement");
              play("navigate");
            }}
          >
            <TabsList className="h-8">
              {TREND_METRICS.map((m) => (
                <TabsTrigger key={m.key} value={m.key} className="text-xs px-3 h-6">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            value={days.toString()}
            onValueChange={(v) => {
              onDaysChange(Number(v));
              play("navigate");
            }}
          >
            <TabsList className="h-8">
              {TREND_RANGE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value.toString()} className="text-xs px-3 h-6">
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <ChartContainer config={trendConfig} className="h-[280px] w-full">
        <AreaChart data={chartData}>
          <defs>
            {activeFields.map((field) => (
              <linearGradient key={field} id={`fill-${field}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`var(--color-${field})`} stopOpacity={0.3} />
                <stop offset="95%" stopColor={`var(--color-${field})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={45} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {activeFields.map((field) => (
            <Area
              key={field}
              type="monotone"
              dataKey={field}
              stroke={`var(--color-${field})`}
              fill={`url(#fill-${field})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

// ==================== 增长指标 ====================

function GrowthItem({
  icon: Icon,
  label,
  value,
  color,
  isLoading,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm">
      <div className={cn("p-2 rounded-lg shrink-0", color.replace("text-", "bg-").replace("500", "500/10"))}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-5 w-12" />
          ) : (
            <>
              <span className="text-lg font-bold tabular-nums">
                <CountUp value={value} />
              </span>
              {value > 0 && (
                <Badge variant="secondary" className="text-green-600 bg-green-100 dark:bg-green-900/30 text-[10px] px-1.5 py-0 h-4">
                  <ArrowUpRight className="h-2.5 w-2.5" />
                  +{value}
                </Badge>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

// ==================== 主页面 ====================

export default function StatsPage() {
  const [rangeDays, setRangeDays] = useState<1 | 7 | 30>(30);
  const [trendDays, setTrendDays] = useState(30);
  const { play } = useSound();

  const { data: stats, isLoading: statsLoading } = trpc.admin.getPublicStats.useQuery();
  const { data: growth, isLoading: growthLoading } = trpc.admin.getGrowthStats.useQuery({ days: rangeDays });

  return (
    <div className="container max-w-5xl py-6 space-y-8">
      {/* 标题 */}
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold">数据总览</h1>
          <p className="text-muted-foreground text-sm mt-1">全站运营数据和增长趋势</p>
        </div>
      </FadeIn>

      {/* 核心内容指标 */}
      <FadeIn delay={0.05}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroStat icon={Users} label="注册用户" value={stats?.userCount ?? 0} color="blue" isLoading={statsLoading} />
          <HeroStat icon={Video} label="视频" value={stats?.videoCount ?? 0} color="green" isLoading={statsLoading} />
          <HeroStat icon={Images} label="图片" value={stats?.imagePostCount ?? 0} color="violet" isLoading={statsLoading} />
          <HeroStat icon={Gamepad2} label="游戏" value={stats?.gameCount ?? 0} color="amber" isLoading={statsLoading} />
        </div>
      </FadeIn>

      {/* 全站互动总量 */}
      <FadeIn delay={0.1}>
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">全站互动</h2>
          <EngagementRow
            isLoading={statsLoading}
            items={[
              { icon: Eye, label: "总浏览", value: stats?.totalViews ?? 0, color: "text-orange-500" },
              { icon: Heart, label: "总点赞", value: stats?.totalLikes ?? 0, color: "text-red-500" },
              { icon: Star, label: "总收藏", value: stats?.totalFavorites ?? 0, color: "text-yellow-500" },
              { icon: MessageSquare, label: "总评论", value: stats?.totalComments ?? 0, color: "text-cyan-500" },
            ]}
          />
        </div>
      </FadeIn>

      {/* 内容分布 + 分区互动对比 */}
      <FadeIn delay={0.15}>
        <div className="grid gap-4 md:grid-cols-2">
          <ContentDistributionChart
            videoCount={stats?.videoCount ?? 0}
            imagePostCount={stats?.imagePostCount ?? 0}
            gameCount={stats?.gameCount ?? 0}
            isLoading={statsLoading}
          />
          <ZoneEngagementChart
            stats={
              stats
                ? {
                    video: stats.video,
                    game: stats.game,
                    image: stats.image,
                    videoViews: stats.videoViews,
                    gameViews: stats.gameViews,
                    imageViews: stats.imageViews,
                  }
                : undefined
            }
            isLoading={statsLoading}
          />
        </div>
      </FadeIn>

      {/* 每日增长趋势图 */}
      <FadeIn delay={0.2}>
        <GrowthTrendChart days={trendDays} onDaysChange={setTrendDays} />
      </FadeIn>

      {/* 其他累计数据 */}
      <FadeIn delay={0.25}>
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-muted-foreground">其他数据</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Tag, label: "标签", value: stats?.tagCount ?? 0, color: "text-purple-500" },
              { icon: Layers, label: "合集", value: stats?.seriesCount ?? 0, color: "text-indigo-500" },
              { icon: Search, label: "搜索次数", value: stats?.searchCount ?? 0, color: "text-pink-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
                <div className={cn("p-2 rounded-lg shrink-0", item.color.replace("text-", "bg-").replace("500", "500/10"))}>
                  <item.icon className={cn("h-4 w-4", item.color)} />
                </div>
                <div>
                  {statsLoading ? (
                    <Skeleton className="h-5 w-12 mb-1" />
                  ) : (
                    <p className="text-lg font-bold tabular-nums leading-tight">
                      <CountUp value={item.value} />
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeIn>

      {/* 增长趋势 */}
      <FadeIn delay={0.3}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              增长趋势
            </h2>
            <Tabs
              value={rangeDays.toString()}
              onValueChange={(v) => {
                setRangeDays(Number(v) as 1 | 7 | 30);
                play("navigate");
              }}
            >
              <TabsList className="h-8">
                {RANGE_OPTIONS.map((opt) => (
                  <TabsTrigger key={opt.value} value={opt.value.toString()} className="text-xs px-3 h-6">
                    {opt.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <GrowthItem icon={Users} label="新增用户" value={growth?.newUsers ?? 0} color="text-blue-500" isLoading={growthLoading} />
            <GrowthItem icon={Video} label="新增视频" value={growth?.newVideos ?? 0} color="text-green-500" isLoading={growthLoading} />
            <GrowthItem icon={Images} label="新增图片" value={growth?.newImagePosts ?? 0} color="text-violet-500" isLoading={growthLoading} />
            <GrowthItem icon={Gamepad2} label="新增游戏" value={growth?.newGames ?? 0} color="text-amber-500" isLoading={growthLoading} />
            <GrowthItem icon={Eye} label="新增浏览" value={growth?.newViews ?? 0} color="text-orange-500" isLoading={growthLoading} />
            <GrowthItem icon={Heart} label="新增点赞" value={growth?.newLikes ?? 0} color="text-red-500" isLoading={growthLoading} />
            <GrowthItem icon={Star} label="新增收藏" value={growth?.newFavorites ?? 0} color="text-yellow-500" isLoading={growthLoading} />
            <GrowthItem icon={MessageSquare} label="新增评论" value={growth?.newComments ?? 0} color="text-cyan-500" isLoading={growthLoading} />
            <GrowthItem icon={Tag} label="新增标签" value={growth?.newTags ?? 0} color="text-purple-500" isLoading={growthLoading} />
            <GrowthItem icon={Layers} label="新增合集" value={growth?.newSeries ?? 0} color="text-indigo-500" isLoading={growthLoading} />
            <GrowthItem icon={Search} label="新增搜索" value={growth?.newSearches ?? 0} color="text-pink-500" isLoading={growthLoading} />
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
