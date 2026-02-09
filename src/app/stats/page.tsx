"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Video,
  Tag,
  Eye,
  Heart,
  Star,
  TrendingUp,
  BarChart3,
  MessageSquare,
  ArrowUpRight,
  Sparkles,
  ThumbsDown,
  Layers,
  Search,
} from "lucide-react";

const RANGE_OPTIONS = [
  { value: 1, label: "一天" },
  { value: 7, label: "一周" },
  { value: 30, label: "一月" },
] as const;

function formatNumber(num: number | undefined | null): string {
  if (num == null) return "0";
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

const totalStatItems = [
  { key: "userCount", label: "用户", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "videoCount", label: "视频", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "seriesCount", label: "合集", icon: Layers, color: "text-indigo-500", bgColor: "bg-indigo-500/10" },
  { key: "tagCount", label: "标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "commentCount", label: "评论", icon: MessageSquare, color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
  { key: "totalViews", label: "播放量", icon: Eye, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  { key: "likeCount", label: "点赞", icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10" },
  { key: "dislikeCount", label: "踩", icon: ThumbsDown, color: "text-slate-500", bgColor: "bg-slate-500/10" },
  { key: "favoriteCount", label: "收藏", icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  { key: "searchCount", label: "搜索次数", icon: Search, color: "text-pink-500", bgColor: "bg-pink-500/10" },
] as const;

const growthStatItems = [
  { key: "newUsers", label: "新增用户", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "newVideos", label: "新增视频", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "newSeries", label: "新增合集", icon: Layers, color: "text-indigo-500", bgColor: "bg-indigo-500/10" },
  { key: "newTags", label: "新增标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "newComments", label: "新增评论", icon: MessageSquare, color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
  { key: "newViews", label: "新增播放", icon: Eye, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  { key: "newLikes", label: "新增点赞", icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10" },
  { key: "newDislikes", label: "新增踩", icon: ThumbsDown, color: "text-slate-500", bgColor: "bg-slate-500/10" },
  { key: "newFavorites", label: "新增收藏", icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  { key: "newSearches", label: "新增搜索", icon: Search, color: "text-pink-500", bgColor: "bg-pink-500/10" },
] as const;

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  subtitle,
  trend,
  formatter,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  bgColor: string;
  subtitle?: string;
  trend?: number;
  formatter?: (v: number) => string;
}) {
  const displayValue = formatter ? formatter(value ?? 0) : formatNumber(value);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:shadow-sm transition-shadow">
      <div className={`p-2 rounded-lg ${bgColor} shrink-0`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{displayValue}</span>
          {trend !== undefined && trend > 0 && (
            <Badge variant="secondary" className="text-green-600 bg-green-100 dark:bg-green-900/30 text-xs px-1.5 py-0">
              <ArrowUpRight className="h-3 w-3" />
              {trend}%
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {label}
          {subtitle && <span className="opacity-70"> · {subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border">
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [rangeDays, setRangeDays] = useState<1 | 7 | 30>(30);

  const { data: totalStats, isLoading: totalLoading } =
    trpc.admin.getPublicStats.useQuery();

  const { data: growthStats, isLoading: growthLoading } =
    trpc.admin.getGrowthStats.useQuery({ days: rangeDays });

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === rangeDays)?.label ?? "一月";

  return (
    <div className="space-y-6 px-4 md:px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">数据总览</h1>
          <p className="text-muted-foreground text-sm">网站运营数据和增长趋势</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              累计数据
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2">
              {totalLoading
                ? Array(totalStatItems.length).fill(0).map((_, i) => <StatCardSkeleton key={i} />)
                : totalStats &&
                  totalStatItems.map((item) => (
                    <StatCard
                      key={item.key}
                      label={item.label}
                      value={totalStats[item.key]}
                      icon={item.icon}
                      color={item.color}
                      bgColor={item.bgColor}
                      formatter={"formatter" in item ? item.formatter : undefined}
                    />
                  ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                增量
              </CardTitle>
              <Tabs
                value={rangeDays.toString()}
                onValueChange={(v) => setRangeDays(Number(v) as 1 | 7 | 30)}
              >
                <TabsList className="h-8">
                  {RANGE_OPTIONS.map((opt) => (
                    <TabsTrigger
                      key={opt.value}
                      value={opt.value.toString()}
                      className="text-xs px-2.5 h-6"
                    >
                      {opt.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2">
              {growthLoading
                ? Array(growthStatItems.length).fill(0).map((_, i) => <StatCardSkeleton key={i} />)
                : growthStats &&
                  growthStatItems.map((item) => (
                    <StatCard
                      key={item.key}
                      label={item.label}
                      value={growthStats[item.key]}
                      icon={item.icon}
                      color={item.color}
                      bgColor={item.bgColor}
                      subtitle={rangeLabel}
                    />
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
