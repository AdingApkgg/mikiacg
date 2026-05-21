"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSound } from "@/hooks/use-sound";
import {
  DateRangePicker,
  createDateRange,
  dateRangeToApi,
  type DateRangeValue,
} from "@/components/ui/date-range-picker";
import {
  Users,
  Video,
  Tag,
  Eye,
  TrendingUp,
  Gamepad2,
  Images,
  Layers,
  Search,
  DollarSign,
  Activity,
  Filter,
  Sparkles,
  Target,
  ShieldCheck,
  Flame,
  Inbox,
  AlertCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { MotionPage } from "@/components/motion";
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
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "../_components/charts/chart-card";
import { SparklineCard } from "../_components/charts/sparkline-card";
import { ActivityHeatmap } from "../_components/charts/activity-heatmap";
import { ConversionFunnel } from "../_components/charts/conversion-funnel";
import { formatCompact, formatUSDT } from "../_components/charts/utils";

const TREND_PRESETS = [
  { label: "7天", days: 7 },
  { label: "14天", days: 14 },
  { label: "30天", days: 30 },
];

const FULL_PRESETS = [
  { label: "7天", days: 7 },
  { label: "30天", days: 30 },
  { label: "90天", days: 90 },
];

// ==================== 顶部 KPI Sparkline Cards ====================

function KPIBar({
  stats,
  trendData,
  revenueData,
  loading,
}: {
  stats:
    | {
        userCount: number;
        videoCount: number;
        imagePostCount: number;
        gameCount: number;
        totalViews: number;
        totalLikes: number;
        totalFavorites: number;
        totalComments: number;
      }
    | undefined;
  trendData: { date: string; users: number; videos: number; images: number; games: number; views: number }[];
  revenueData: { date: string; revenue: number; orders: number; users: number }[];
  loading: boolean;
}) {
  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <SparklineCard
        icon={Users}
        label="注册用户"
        value={stats?.userCount ?? 0}
        series={trendData.map((d) => d.users)}
        color="hsl(217, 91%, 60%)"
        loading={loading}
      />
      <SparklineCard
        icon={Video}
        label="视频"
        value={stats?.videoCount ?? 0}
        series={trendData.map((d) => d.videos)}
        color="hsl(142, 71%, 45%)"
        loading={loading}
      />
      <SparklineCard
        icon={Images}
        label="图片"
        value={stats?.imagePostCount ?? 0}
        series={trendData.map((d) => d.images)}
        color="hsl(263, 70%, 55%)"
        loading={loading}
      />
      <SparklineCard
        icon={Gamepad2}
        label="游戏"
        value={stats?.gameCount ?? 0}
        series={trendData.map((d) => d.games)}
        color="hsl(38, 92%, 50%)"
        loading={loading}
      />
      <SparklineCard
        icon={Eye}
        label="总浏览"
        value={stats?.totalViews ?? 0}
        series={trendData.map((d) => d.views)}
        format={formatCompact}
        color="hsl(25, 95%, 53%)"
        loading={loading}
      />
      <SparklineCard
        icon={DollarSign}
        label={`${revenueData.length}天收入`}
        value={totalRevenue}
        series={revenueData.map((d) => d.revenue)}
        format={formatUSDT}
        color="hsl(160, 80%, 45%)"
        loading={loading}
      />
    </div>
  );
}

// ==================== 综合健康互动条 ====================

function EngagementMicro({
  stats,
  loading,
}: {
  stats:
    | {
        totalLikes: number;
        totalFavorites: number;
        totalComments: number;
        totalViews: number;
      }
    | undefined;
  loading: boolean;
}) {
  if (loading || !stats) {
    return <Skeleton className="h-9 w-full" />;
  }
  const sum = stats.totalLikes + stats.totalFavorites + stats.totalComments;
  if (sum === 0) return null;
  const segs = [
    { label: "点赞", value: stats.totalLikes, color: "hsl(0, 84%, 60%)" },
    { label: "收藏", value: stats.totalFavorites, color: "hsl(48, 96%, 53%)" },
    { label: "评论", value: stats.totalComments, color: "hsl(187, 85%, 53%)" },
  ];
  const engagementRate = stats.totalViews > 0 ? (sum / stats.totalViews) * 100 : 0;
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          <span>互动占比</span>
        </div>
        <div className="flex items-center gap-3 tabular-nums">
          <span className="text-muted-foreground">综合互动率</span>
          <span className="font-semibold text-foreground">{engagementRate.toFixed(2)}%</span>
        </div>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((s) => (
          <div
            key={s.label}
            className="h-full transition-all"
            style={{ width: `${(s.value / sum) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="tabular-nums font-medium">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 内容分布 Pie ====================

const contentPieConfig = {
  videos: { label: "视频", color: "hsl(142, 71%, 45%)" },
  images: { label: "图片", color: "hsl(263, 70%, 55%)" },
  games: { label: "游戏", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig;

function ContentDistribution({
  videoCount,
  imageCount,
  gameCount,
  loading,
}: {
  videoCount: number;
  imageCount: number;
  gameCount: number;
  loading: boolean;
}) {
  const data = useMemo(
    () => [
      { name: "videos", value: videoCount, fill: "var(--color-videos)" },
      { name: "images", value: imageCount, fill: "var(--color-images)" },
      { name: "games", value: gameCount, fill: "var(--color-games)" },
    ],
    [videoCount, imageCount, gameCount],
  );
  const total = videoCount + imageCount + gameCount;

  return (
    <ChartCard title="内容分布" icon={Layers} loading={loading} empty={total === 0}>
      <ChartContainer config={contentPieConfig} className="mx-auto aspect-square h-[220px]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            strokeWidth={2}
            stroke="hsl(var(--background))"
          />
          <text
            x="50%"
            y="48%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-2xl font-bold"
          >
            {formatCompact(total)}
          </text>
          <text
            x="50%"
            y="60%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-xs"
          >
            总内容
          </text>
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </PieChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ==================== 分区健康度 Radar ====================

const radarConfig = {
  likeRate: { label: "点赞率", color: "hsl(0, 84%, 60%)" },
  favRate: { label: "收藏率", color: "hsl(48, 96%, 53%)" },
  commentRate: { label: "评论率", color: "hsl(187, 85%, 53%)" },
} satisfies ChartConfig;

function ZoneHealthRadar({
  data,
  loading,
}: {
  data: { zone: string; likeRate: number; favRate: number; commentRate: number; score: number }[] | undefined;
  loading: boolean;
}) {
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((d) => ({
      zone: d.zone,
      likeRate: d.likeRate,
      favRate: d.favRate,
      commentRate: d.commentRate,
    }));
  }, [data]);

  return (
    <ChartCard
      title="分区健康度（互动率 %）"
      icon={ShieldCheck}
      loading={loading}
      empty={!data || data.length === 0}
      footer={
        data && (
          <div className="flex justify-around gap-2 tabular-nums">
            {data.map((d) => (
              <div key={d.zone} className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{d.zone}</span>
                <span
                  className={
                    d.score >= 70 ? "text-emerald-500 font-medium" : d.score >= 40 ? "text-amber-500" : "text-rose-500"
                  }
                >
                  {d.score}分
                </span>
              </div>
            ))}
          </div>
        )
      }
    >
      <ChartContainer config={radarConfig} className="mx-auto aspect-square h-[220px]">
        <RadarChart data={chartData}>
          <ChartTooltip content={<ChartTooltipContent />} />
          <PolarAngleAxis dataKey="zone" tick={{ fontSize: 11 }} />
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarRadiusAxis tick={false} axisLine={false} />
          <Radar
            dataKey="likeRate"
            stroke="var(--color-likeRate)"
            fill="var(--color-likeRate)"
            fillOpacity={0.25}
            strokeWidth={1.5}
          />
          <Radar
            dataKey="favRate"
            stroke="var(--color-favRate)"
            fill="var(--color-favRate)"
            fillOpacity={0.2}
            strokeWidth={1.5}
          />
          <Radar
            dataKey="commentRate"
            stroke="var(--color-commentRate)"
            fill="var(--color-commentRate)"
            fillOpacity={0.18}
            strokeWidth={1.5}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </RadarChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ==================== 分区互动柱状图 ====================

const zoneBarConfig = {
  views: { label: "浏览", color: "hsl(25, 95%, 53%)" },
  likes: { label: "点赞", color: "hsl(0, 84%, 60%)" },
  favorites: { label: "收藏", color: "hsl(48, 96%, 53%)" },
  comments: { label: "评论", color: "hsl(187, 85%, 53%)" },
} satisfies ChartConfig;

function ZoneEngagementBar({
  stats,
  loading,
}: {
  stats:
    | {
        video: { likes: number; favorites: number; comments: number };
        game: { likes: number; favorites: number; comments: number };
        image: { likes: number; favorites: number; comments: number };
        videoViews: number;
        gameViews: number;
        imageViews: number;
      }
    | undefined;
  loading: boolean;
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

  return (
    <ChartCard title="分区互动对比" icon={Flame} loading={loading} empty={data.length === 0}>
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
    </ChartCard>
  );
}

// ==================== 增长趋势 ====================

const TREND_METRICS = [
  { key: "content", label: "内容", fields: ["users", "videos", "images", "games"] },
  { key: "engagement", label: "互动", fields: ["views", "likes", "favorites", "comments"] },
] as const;

const trendConfig = {
  users: { label: "用户", color: "hsl(217, 91%, 60%)" },
  videos: { label: "视频", color: "hsl(142, 71%, 45%)" },
  images: { label: "图片", color: "hsl(263, 70%, 55%)" },
  games: { label: "游戏", color: "hsl(38, 92%, 50%)" },
  views: { label: "浏览", color: "hsl(25, 95%, 53%)" },
  likes: { label: "点赞", color: "hsl(0, 84%, 60%)" },
  favorites: { label: "收藏", color: "hsl(48, 96%, 53%)" },
  comments: { label: "评论", color: "hsl(187, 85%, 53%)" },
} satisfies ChartConfig;

function GrowthTrendChart({
  range,
  onRangeChange,
}: {
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
}) {
  const { play } = useSound();
  const [metricGroup, setMetricGroup] = useState<"content" | "engagement">("content");
  const { data: trend, isLoading } = trpc.admin.getGrowthTrend.useQuery(dateRangeToApi(range));

  const activeFields = TREND_METRICS.find((m) => m.key === metricGroup)!.fields;

  const chartData = useMemo(() => {
    if (!trend) return [];
    return trend.map((d) => ({
      ...d,
      label: d.date.slice(5),
    }));
  }, [trend]);

  return (
    <ChartCard
      title="每日增长趋势"
      icon={TrendingUp}
      loading={isLoading}
      empty={chartData.length === 0}
      action={
        <div className="flex items-center gap-2">
          <Tabs
            value={metricGroup}
            onValueChange={(v) => {
              setMetricGroup(v as "content" | "engagement");
              play("navigate");
            }}
          >
            <TabsList className="h-7">
              {TREND_METRICS.map((m) => (
                <TabsTrigger key={m.key} value={m.key} className="text-[11px] px-2 h-5">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DateRangePicker value={range} onChange={onRangeChange} presets={TREND_PRESETS} />
        </div>
      }
    >
      <ChartContainer config={trendConfig} className="h-[260px] w-full">
        <AreaChart data={chartData}>
          <defs>
            {activeFields.map((field) => (
              <linearGradient key={field} id={`fill-trend-${field}`} x1="0" y1="0" x2="0" y2="1">
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
              fill={`url(#fill-trend-${field})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ==================== 收入 vs 新用户 Composed ====================

const revenueConfig = {
  revenue: { label: "收入 (USDT)", color: "hsl(160, 80%, 45%)" },
  users: { label: "新用户", color: "hsl(217, 91%, 60%)" },
  orders: { label: "订单", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig;

function RevenueComposed({
  range,
  onRangeChange,
}: {
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
}) {
  const { data, isLoading } = trpc.admin.getRevenueTrend.useQuery(dateRangeToApi(range));
  const chartData = useMemo(
    () =>
      (data ?? []).map((d) => ({
        ...d,
        label: d.date.slice(5),
      })),
    [data],
  );

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = chartData.reduce((s, d) => s + d.orders, 0);
  const totalUsers = chartData.reduce((s, d) => s + d.users, 0);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <ChartCard
      title="收入 vs 新用户"
      icon={DollarSign}
      loading={isLoading}
      empty={chartData.length === 0}
      action={<DateRangePicker value={range} onChange={onRangeChange} presets={TREND_PRESETS} />}
      footer={
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          <span>
            合计 <span className="text-emerald-500 font-medium">{formatUSDT(totalRevenue)}</span>
          </span>
          <span>
            订单 <span className="text-foreground font-medium">{totalOrders}</span>
          </span>
          <span>
            新用户 <span className="text-foreground font-medium">{totalUsers}</span>
          </span>
          <span>
            客单价 <span className="text-foreground font-medium">{formatUSDT(avgOrder)}</span>
          </span>
        </div>
      }
    >
      <ChartContainer config={revenueConfig} className="h-[260px] w-full">
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="fill-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => "$" + formatCompact(v)}
            width={50}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCompact(v)}
            width={36}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-revenue)"
            fill="url(#fill-revenue)"
            strokeWidth={2}
            dot={false}
          />
          <Bar yAxisId="right" dataKey="users" fill="var(--color-users)" radius={[3, 3, 0, 0]} barSize={12} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="orders"
            stroke="var(--color-orders)"
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ==================== 转化漏斗 ====================

const FUNNEL_COLORS = ["hsl(217, 91%, 60%)", "hsl(263, 70%, 55%)", "hsl(289, 75%, 55%)", "hsl(160, 80%, 45%)"];

function ConversionFunnelCard() {
  const { data, isLoading } = trpc.admin.getConversionFunnel.useQuery(undefined);
  const stages = useMemo(
    () => (data ?? []).map((d, i) => ({ ...d, fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length] })),
    [data],
  );
  return (
    <ChartCard
      title="用户成长漏斗"
      icon={Target}
      loading={isLoading}
      empty={!data || data.every((d) => d.value === 0)}
      description="注册 → 互动 → 创作 → 付费"
    >
      <div className="h-[220px] w-full flex items-center">
        <ConversionFunnel data={stages} className="w-full" />
      </div>
    </ChartCard>
  );
}

// ==================== 24×7 活跃度热力 ====================

function HeatmapCard({ range, onRangeChange }: { range: DateRangeValue; onRangeChange: (r: DateRangeValue) => void }) {
  const { data, isLoading } = trpc.admin.getActivityHeatmap.useQuery(dateRangeToApi(range));
  return (
    <ChartCard
      title="活跃度热力图"
      icon={Activity}
      description="按小时 × 星期统计用户活动"
      loading={isLoading}
      empty={!data || data.total === 0}
      action={<DateRangePicker value={range} onChange={onRangeChange} presets={TREND_PRESETS} />}
    >
      <div className="h-[220px] flex items-center">
        <ActivityHeatmap cells={data?.cells ?? []} max={data?.max ?? 0} />
      </div>
    </ChartCard>
  );
}

// ==================== 热门标签 Treemap ====================

const TAG_PALETTE = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(263, 70%, 55%)",
  "hsl(0, 84%, 60%)",
  "hsl(48, 96%, 53%)",
  "hsl(187, 85%, 53%)",
  "hsl(289, 75%, 55%)",
  "hsl(160, 80%, 45%)",
  "hsl(330, 80%, 60%)",
];

function TagTreemapCard() {
  const [kind, setKind] = useState<"all" | "video" | "image" | "game">("all");
  const { data, isLoading } = trpc.admin.getTopTags.useQuery({ limit: 40, kind });

  const treeData = useMemo(
    () =>
      (data ?? []).map((t, i) => ({
        name: t.name,
        size: t.value,
        fill: t.color || TAG_PALETTE[i % TAG_PALETTE.length],
        category: t.category,
        video: t.video,
        game: t.game,
        image: t.image,
      })),
    [data],
  );

  return (
    <ChartCard
      title="热门标签 Top 40"
      icon={Tag}
      loading={isLoading}
      empty={treeData.length === 0}
      action={
        <Tabs value={kind} onValueChange={(v) => setKind(v as "all" | "video" | "image" | "game")}>
          <TabsList className="h-7">
            <TabsTrigger value="all" className="text-[11px] px-2 h-5">
              全部
            </TabsTrigger>
            <TabsTrigger value="video" className="text-[11px] px-2 h-5">
              视频
            </TabsTrigger>
            <TabsTrigger value="image" className="text-[11px] px-2 h-5">
              图片
            </TabsTrigger>
            <TabsTrigger value="game" className="text-[11px] px-2 h-5">
              游戏
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="h-[260px] w-full">
        <Treemap
          data={treeData}
          dataKey="size"
          stroke="hsl(var(--background))"
          fill="hsl(var(--primary))"
          aspectRatio={4 / 3}
          isAnimationActive={false}
          content={<TreemapNode />}
        />
      </div>
    </ChartCard>
  );
}

type TreemapNodeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
};

function TreemapNode(props: TreemapNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, size, fill } = props;
  if (width < 1 || height < 1) return null;
  const showText = width > 50 && height > 28;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill: fill || "var(--color-stage-1)", stroke: "hsl(var(--background))", strokeWidth: 1.5 }}
        rx={2}
      />
      {showText && (
        <>
          <text
            x={x + 6}
            y={y + 16}
            fill="rgba(255,255,255,0.95)"
            fontSize={11}
            fontWeight={500}
            className="pointer-events-none"
          >
            {name}
          </text>
          <text
            x={x + 6}
            y={y + 30}
            fill="rgba(255,255,255,0.7)"
            fontSize={10}
            className="pointer-events-none tabular-nums"
          >
            {size?.toLocaleString()}
          </text>
        </>
      )}
    </g>
  );
}

// ==================== 增长 RadialBar（达成进度示意） ====================

const radialConfig = {
  users: { label: "新用户", color: "hsl(217, 91%, 60%)" },
  videos: { label: "新视频", color: "hsl(142, 71%, 45%)" },
  images: { label: "新图片", color: "hsl(263, 70%, 55%)" },
  games: { label: "新游戏", color: "hsl(38, 92%, 50%)" },
} satisfies ChartConfig;

function GrowthRadial({ range, onRangeChange }: { range: DateRangeValue; onRangeChange: (r: DateRangeValue) => void }) {
  const { data, isLoading } = trpc.admin.getGrowthStats.useQuery(dateRangeToApi(range));

  // 假设运营目标，取每个维度的当前值与一个动态目标做对比
  const items = useMemo(() => {
    if (!data) return [];
    const base = {
      users: Math.max(50, data.newUsers * 1.2),
      videos: Math.max(20, data.newVideos * 1.2),
      images: Math.max(20, data.newImagePosts * 1.2),
      games: Math.max(10, data.newGames * 1.2),
    };
    return [
      { key: "users", label: "新用户", value: data.newUsers, target: Math.ceil(base.users) },
      { key: "videos", label: "新视频", value: data.newVideos, target: Math.ceil(base.videos) },
      { key: "images", label: "新图片", value: data.newImagePosts, target: Math.ceil(base.images) },
      { key: "games", label: "新游戏", value: data.newGames, target: Math.ceil(base.games) },
    ];
  }, [data]);

  const radialData = items.map((it) => ({
    name: it.label,
    value: Math.round((it.value / it.target) * 100),
    actual: it.value,
    target: it.target,
    fill: `var(--color-${it.key})`,
  }));

  return (
    <ChartCard
      title="增长达成率"
      icon={Sparkles}
      description="较去年同期推算目标"
      loading={isLoading}
      empty={!data}
      action={<DateRangePicker value={range} onChange={onRangeChange} presets={FULL_PRESETS} />}
    >
      <ChartContainer config={radialConfig} className="mx-auto aspect-square h-[240px]">
        <RadialBarChart
          innerRadius="35%"
          outerRadius="100%"
          barSize={14}
          data={radialData}
          startAngle={90}
          endAngle={-270}
        >
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof radialData)[number];
              return (
                <div className="rounded-md border bg-popover px-2 py-1.5 text-xs shadow-md tabular-nums">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-muted-foreground">
                    {p.actual} / {p.target} · {p.value}%
                  </div>
                </div>
              );
            }}
          />
          <RadialBar dataKey="value" background cornerRadius={6}>
            {radialData.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </RadialBar>
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <ChartLegend content={<ChartLegendContent nameKey="name" />} />
        </RadialBarChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ==================== 工单提醒 ====================

function PendingTicketsCard({ canManage }: { canManage: boolean }) {
  const { data, isLoading } = trpc.admin.stats.useQuery(undefined, {
    enabled: canManage,
    staleTime: 60_000,
  });

  if (!canManage || isLoading || !data) return null;
  const pending = data.counts.PENDING ?? 0;
  const waiting = data.counts.WAITING_USER ?? 0;
  const inProgress = data.counts.IN_PROGRESS ?? 0;
  const active = pending + waiting + inProgress;
  if (active === 0) return null;

  return (
    <Link
      href="/dashboard/tickets"
      className="block rounded-xl border bg-card hover:bg-accent/30 transition-colors p-4"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Inbox className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <div className="text-sm font-medium leading-tight">工单提醒</div>
            <div className="text-xs text-muted-foreground">今日新增 {data.todayCount} 条</div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto flex-wrap text-xs">
          <TicketPill icon={AlertCircle} label="待处理" value={pending} color="amber" />
          <TicketPill icon={Clock} label="处理中" value={inProgress} color="blue" />
          <TicketPill icon={AlertCircle} label="等待用户" value={waiting} color="orange" />
          <span className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            查看全部
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TicketPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  color: "amber" | "blue" | "orange";
}) {
  if (value === 0) return null;
  const styles: Record<typeof color, string> = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    orange: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${styles[color]}`}>
      <Icon className="h-3 w-3" />
      {label}
      <span className="font-semibold tabular-nums ml-0.5">{value}</span>
    </span>
  );
}

// ==================== 主页面 ====================

export default function StatsPage() {
  const [growthRange, setGrowthRange] = useState<DateRangeValue>(() => createDateRange(30));
  const [trendRange, setTrendRange] = useState<DateRangeValue>(() => createDateRange(30));
  const [revenueRange, setRevenueRange] = useState<DateRangeValue>(() => createDateRange(30));
  const [heatRange, setHeatRange] = useState<DateRangeValue>(() => createDateRange(14));

  const { data: stats, isLoading: statsLoading } = trpc.admin.getPublicStats.useQuery();
  const { data: trend, isLoading: trendLoading } = trpc.admin.getGrowthTrend.useQuery(dateRangeToApi(trendRange));
  const { data: revenueTrend, isLoading: revLoading } = trpc.admin.getRevenueTrend.useQuery(
    dateRangeToApi(revenueRange),
  );
  const { data: zoneHealth, isLoading: zoneHealthLoading } = trpc.admin.getZoneHealth.useQuery();
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const canManageTickets = !!permissions?.scopes.includes("ticket:manage");

  const otherStats = [
    { icon: Tag, label: "标签", value: stats?.tagCount ?? 0, color: "text-purple-500" },
    { icon: Layers, label: "合集", value: stats?.seriesCount ?? 0, color: "text-indigo-500" },
    { icon: Search, label: "搜索次数", value: stats?.searchCount ?? 0, color: "text-pink-500" },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      {/* 标题 */}
      <MotionPage>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              数据总览
            </h1>
            <p className="text-muted-foreground text-sm mt-1">全站运营核心指标、趋势与转化分析</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>每个面板独立筛选时段</span>
          </div>
        </div>
      </MotionPage>

      {/* 顶部 KPI 卡片 */}
      <MotionPage>
        <KPIBar
          stats={stats}
          trendData={trend ?? []}
          revenueData={revenueTrend ?? []}
          loading={statsLoading || trendLoading || revLoading}
        />
      </MotionPage>

      {/* 综合互动占比条 */}
      <MotionPage>
        <EngagementMicro stats={stats} loading={statsLoading} />
      </MotionPage>

      {/* 工单提醒 */}
      {canManageTickets && (
        <MotionPage>
          <PendingTicketsCard canManage={canManageTickets} />
        </MotionPage>
      )}

      {/* 收入 + 用户增长 */}
      <MotionPage>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RevenueComposed range={revenueRange} onRangeChange={setRevenueRange} />
          </div>
          <ConversionFunnelCard />
        </div>
      </MotionPage>

      {/* 增长趋势 + 达成 */}
      <MotionPage>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GrowthTrendChart range={trendRange} onRangeChange={setTrendRange} />
          </div>
          <GrowthRadial range={growthRange} onRangeChange={setGrowthRange} />
        </div>
      </MotionPage>

      {/* 热力图 */}
      <MotionPage>
        <HeatmapCard range={heatRange} onRangeChange={setHeatRange} />
      </MotionPage>

      {/* 内容分布 / 分区健康 / 分区互动 */}
      <MotionPage>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ContentDistribution
            videoCount={stats?.videoCount ?? 0}
            imageCount={stats?.imagePostCount ?? 0}
            gameCount={stats?.gameCount ?? 0}
            loading={statsLoading}
          />
          <ZoneHealthRadar data={zoneHealth} loading={zoneHealthLoading} />
          <ZoneEngagementBar
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
            loading={statsLoading}
          />
        </div>
      </MotionPage>

      {/* 标签 Treemap */}
      <MotionPage>
        <TagTreemapCard />
      </MotionPage>

      {/* 其他累计 */}
      <MotionPage>
        <div className="grid grid-cols-3 gap-3">
          {otherStats.map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <div className={`p-2 rounded-lg shrink-0 ${item.color.replace("text-", "bg-").replace("500", "500/10")}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <p className="text-lg font-bold tabular-nums leading-tight">{formatCompact(item.value)}</p>
                )}
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </MotionPage>
    </div>
  );
}
