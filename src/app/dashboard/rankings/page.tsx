"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Trophy, Save, RefreshCw, Loader2, History } from "lucide-react";
import { toast } from "@/lib/toast-with-sound";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";

const configSchema = z.object({
  enabled: z.boolean(),
  topN: z.number().min(10).max(1000),
  weightViews: z.number().min(0).max(100),
  weightLikes: z.number().min(0).max(100),
  weightFavorites: z.number().min(0).max(100),
  weightComments: z.number().min(0).max(100),
  quotaVideo: z.number().min(0).max(1000),
  quotaImage: z.number().min(0).max(1000),
  quotaGame: z.number().min(0).max(1000),
});

type ConfigFormValues = z.infer<typeof configSchema>;

/** Input 数字字段的 onChange 适配器：把字符串转成 number 写回 RHF */
function toNumber(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 榜单组合矩阵（contentType, category, period） */
const RANKING_MATRIX: Array<{
  contentType: "video" | "image" | "game" | "combined" | "tag";
  category: "score" | "surge" | "fav_period" | "fav_total" | "tag_hot" | "tag_surge";
  period: "1d" | "7d" | "30d" | "all";
  label: string;
}> = [
  // 视频
  { contentType: "video", category: "score", period: "1d", label: "视频 · 日榜" },
  { contentType: "video", category: "score", period: "7d", label: "视频 · 周榜" },
  { contentType: "video", category: "score", period: "30d", label: "视频 · 月榜" },
  { contentType: "video", category: "surge", period: "1d", label: "视频 · 飙升" },
  { contentType: "video", category: "fav_period", period: "7d", label: "视频 · 周收藏" },
  { contentType: "video", category: "fav_period", period: "30d", label: "视频 · 月收藏" },
  { contentType: "video", category: "fav_total", period: "all", label: "视频 · 总收藏" },
  // 图集
  { contentType: "image", category: "score", period: "1d", label: "图集 · 日榜" },
  { contentType: "image", category: "score", period: "7d", label: "图集 · 周榜" },
  { contentType: "image", category: "score", period: "30d", label: "图集 · 月榜" },
  { contentType: "image", category: "surge", period: "1d", label: "图集 · 飙升" },
  { contentType: "image", category: "fav_period", period: "7d", label: "图集 · 周收藏" },
  { contentType: "image", category: "fav_period", period: "30d", label: "图集 · 月收藏" },
  { contentType: "image", category: "fav_total", period: "all", label: "图集 · 总收藏" },
  // 游戏
  { contentType: "game", category: "score", period: "1d", label: "游戏 · 日榜" },
  { contentType: "game", category: "score", period: "7d", label: "游戏 · 周榜" },
  { contentType: "game", category: "score", period: "30d", label: "游戏 · 月榜" },
  { contentType: "game", category: "surge", period: "1d", label: "游戏 · 飙升" },
  { contentType: "game", category: "fav_period", period: "7d", label: "游戏 · 周收藏" },
  { contentType: "game", category: "fav_period", period: "30d", label: "游戏 · 月收藏" },
  { contentType: "game", category: "fav_total", period: "all", label: "游戏 · 总收藏" },
  // 综合
  { contentType: "combined", category: "score", period: "1d", label: "综合 · 日榜" },
  { contentType: "combined", category: "score", period: "7d", label: "综合 · 周榜" },
  { contentType: "combined", category: "score", period: "30d", label: "综合 · 月榜" },
  // 标签
  { contentType: "tag", category: "tag_hot", period: "all", label: "标签 · 热门" },
  { contentType: "tag", category: "tag_surge", period: "1d", label: "标签 · 增长最快" },
];

function ConfigCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.ranking.getConfig.useQuery();
  const update = trpc.admin.ranking.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("榜单配置已保存");
      utils.admin.ranking.getConfig.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      enabled: true,
      topN: 100,
      weightViews: 0.1,
      weightLikes: 1,
      weightFavorites: 3,
      weightComments: 2,
      quotaVideo: 40,
      quotaImage: 30,
      quotaGame: 30,
    },
  });

  // 加载完成后回填表单
  useEffect(() => {
    if (!data) return;
    const w = (data.weights as { views: number; likes: number; favorites: number; comments: number } | null) ?? null;
    const q = (data.combinedQuota as { video: number; image: number; game: number } | null) ?? null;
    form.reset({
      enabled: data.enabled,
      topN: data.topN,
      weightViews: w?.views ?? 0.1,
      weightLikes: w?.likes ?? 1,
      weightFavorites: w?.favorites ?? 3,
      weightComments: w?.comments ?? 2,
      quotaVideo: q?.video ?? 40,
      quotaImage: q?.image ?? 30,
      quotaGame: q?.game ?? 30,
    });
  }, [data, form]);

  const onSubmit = (v: ConfigFormValues) => {
    update.mutate({
      enabled: v.enabled,
      topN: v.topN,
      weights: { views: v.weightViews, likes: v.weightLikes, favorites: v.weightFavorites, comments: v.weightComments },
      combinedQuota: { video: v.quotaVideo, image: v.quotaImage, game: v.quotaGame },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          榜单配置
        </CardTitle>
        <CardDescription>修改后会自动重启调度器，下个周期生效</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>启用榜单系统</FormLabel>
                      <FormDescription>关闭后调度器停止，/ranking 页面将仅保留「热门排行」Tab</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="topN"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>每个榜单 Top N</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={10}
                        max={1000}
                        {...field}
                        onChange={(e) => field.onChange(toNumber(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>每次计算保留前 N 名（10–1000）</FormDescription>
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <div className="text-sm font-medium">加权公式</div>
                <p className="text-xs text-muted-foreground">
                  综合分 = views×w_v + likes×w_l + favorites×w_f + comments×w_c
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="weightViews"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">播放权重</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weightLikes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">点赞权重</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weightFavorites"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">收藏权重</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weightComments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">评论权重</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium">综合榜配额</div>
                <p className="text-xs text-muted-foreground">每类取该数量条目，按归一化分数混排</p>
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="quotaVideo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">视频</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quotaImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">图集</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quotaGame"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">游戏</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            {...field}
                            onChange={(e) => field.onChange(toNumber(e.target.value))}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存配置
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

function RefreshGridCard() {
  const refresh = trpc.admin.ranking.refresh.useMutation({
    onSuccess: (res) => toast.success(`重算完成，写入 ${res.count} 条`),
    onError: (e) => toast.error(e.message || "重算失败"),
  });
  const [pending, setPending] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          手动重算
        </CardTitle>
        <CardDescription>立即触发某个榜单重算，绕过 cron 周期（用于配置变更后的快速验证）</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {RANKING_MATRIX.map((m) => {
            const key = `${m.contentType}:${m.category}:${m.period}`;
            const isLoading = pending === key && refresh.isPending;
            return (
              <Button
                key={key}
                variant="outline"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => {
                  setPending(key);
                  refresh.mutate({ contentType: m.contentType, category: m.category, period: m.period });
                }}
                className="justify-between"
              >
                <span>{m.label}</span>
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 opacity-50" />
                )}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SnapshotChartCard() {
  const [selected, setSelected] = useState(0);
  const m = RANKING_MATRIX[selected];
  const { data, isLoading } = trpc.admin.ranking.getSnapshots.useQuery(
    { contentType: m.contentType, category: m.category, period: m.period, days: 7 },
    { enabled: !!m },
  );

  const chartConfig: ChartConfig = {
    topScore: { label: "榜首分数", color: "var(--primary)" },
  };

  // 把快照数组转换为 { time, topScore } 序列
  const series = (data ?? [])
    .map((s) => {
      const items = s.items as Array<{ score: number }> | null;
      return { time: new Date(s.createdAt).getTime(), topScore: items?.[0]?.score ?? 0 };
    })
    .sort((a, b) => a.time - b.time);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          历史快照（最近 7 天榜首分数）
        </CardTitle>
        <CardDescription>每次 cron 重算后留一行快照，可用于追溯榜首变化</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {RANKING_MATRIX.map((it, i) => (
            <Button
              key={`${it.contentType}:${it.category}:${it.period}`}
              variant={i === selected ? "default" : "outline"}
              size="sm"
              onClick={() => setSelected(i)}
              className="h-7 text-xs"
            >
              {it.label}
            </Button>
          ))}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无快照数据</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) =>
                  new Date(v).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit" })
                }
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => new Date(v as number).toLocaleString("zh-CN")}
                    indicator="line"
                  />
                }
              />
              <Line type="monotone" dataKey="topScore" stroke="var(--color-topScore)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardRankingsPage() {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">排行榜管理</h1>
        <p className="text-sm text-muted-foreground mt-1">配置权重、手动重算、查看历史快照</p>
      </div>
      <ConfigCard />
      <RefreshGridCard />
      <SnapshotChartCard />
    </div>
  );
}
