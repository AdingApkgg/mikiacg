"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast-with-sound";
import {
  Link2,
  Plus,
  Copy,
  Trash2,
  Loader2,
  Users,
  Coins,
  MousePointerClick,
  TrendingUp,
  ExternalLink,
  History,
} from "lucide-react";
import { useSiteConfig } from "@/contexts/site-config";

const CHANNEL_OPTIONS = [
  { value: "", label: "无渠道" },
  { value: "bilibili", label: "B站" },
  { value: "twitter", label: "Twitter/X" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "wechat", label: "微信" },
  { value: "qq", label: "QQ" },
  { value: "youtube", label: "YouTube" },
  { value: "reddit", label: "Reddit" },
  { value: "blog", label: "博客" },
  { value: "other", label: "其他" },
];

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success("已复制到剪贴板");
  });
}

function StatsCards() {
  const { data: stats, isLoading } = trpc.referral.getMyStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    { label: "推广人数", value: stats?.totalReferrals ?? 0, icon: Users, color: "text-blue-500" },
    { label: "当前积分", value: stats?.points ?? 0, icon: Coins, color: "text-amber-500" },
    { label: "推广链接", value: stats?.totalLinks ?? 0, icon: Link2, color: "text-green-500" },
    { label: "今日点击", value: stats?.todayClicks ?? 0, icon: MousePointerClick, color: "text-purple-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              {item.label}
            </div>
            <div className="text-2xl font-bold">{item.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LinksManager() {
  const siteConfig = useSiteConfig();
  const siteUrl = siteConfig?.siteUrl || (typeof window !== "undefined" ? window.location.origin : "");

  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [newTargetUrl, setNewTargetUrl] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.referral.getMyLinks.useQuery({ page, limit: 20 });

  const createMutation = trpc.referral.createLink.useMutation({
    onSuccess: () => {
      toast.success("推广链接创建成功");
      setShowCreate(false);
      setNewLabel("");
      setNewChannel("");
      setNewTargetUrl("");
      utils.referral.getMyLinks.invalidate();
      utils.referral.getMyStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.referral.updateLink.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      utils.referral.getMyLinks.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.referral.deleteLink.useMutation({
    onSuccess: () => {
      toast.success("推广链接已删除");
      setDeleteId(null);
      utils.referral.getMyLinks.invalidate();
      utils.referral.getMyStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">推广链接</CardTitle>
            <CardDescription>创建不同渠道的推广链接，追踪推广效果</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data?.links.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>还没有推广链接，点击右上角创建一个</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.links.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {link.label || link.code}
                      </span>
                      {link.channel && (
                        <Badge variant="secondary" className="text-xs">
                          {CHANNEL_OPTIONS.find((c) => c.value === link.channel)?.label || link.channel}
                        </Badge>
                      )}
                      {!link.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          已停用
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {siteUrl}/r/{link.code}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="h-3 w-3" />
                        {link.clicks} 点击
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {link.registers} 注册
                      </span>
                      <span>
                        转化率 {link.clicks > 0 ? ((link.registers / link.clicks) * 100).toFixed(1) : "0"}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={link.isActive}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({ id: link.id, isActive: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(`${siteUrl}/r/${link.code}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {link.targetUrl && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={link.targetUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {data.totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-sm text-muted-foreground flex items-center px-2">
                    {page} / {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建推广链接</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标签（可选）</label>
              <Input
                placeholder="如：B站个人简介"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">渠道</label>
              <Select value={newChannel} onValueChange={setNewChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="选择渠道" />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "_none"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">自定义落地页（可选）</label>
              <Input
                placeholder="https://..."
                value={newTargetUrl}
                onChange={(e) => setNewTargetUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                留空则跳转到站点首页
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  label: newLabel || undefined,
                  channel: (newChannel === "_none" ? "" : newChannel) || undefined,
                  targetUrl: newTargetUrl || undefined,
                })
              }
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后推广链接将无法访问，已有推广记录不会受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReferralsList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.referral.getMyReferrals.useQuery({ page, limit: 20 });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">推广用户</CardTitle>
        <CardDescription>通过你的链接注册的用户</CardDescription>
      </CardHeader>
      <CardContent>
        {!data?.records.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>暂无推广用户</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.records.map((record) => (
              <div
                key={record.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {(record.referredUser.nickname || record.referredUser.username)?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {record.referredUser.nickname || record.referredUser.username}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{record.referredUser.username}
                    {record.referralLink && (
                      <span className="ml-2">
                        via {record.referralLink.label || record.referralLink.code}
                        {record.referralLink.channel && ` (${record.referralLink.channel})`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    <Coins className="h-3 w-3 mr-1" />
                    +{record.pointsAwarded}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}

            {data.totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground flex items-center px-2">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PointsHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.referral.getPointsHistory.useQuery({ page, limit: 20 });

  const typeLabels: Record<string, string> = {
    REFERRAL_REWARD: "推广奖励",
    ADMIN_ADJUST: "管理员调整",
    POINTS_CONSUME: "积分消耗",
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">积分流水</CardTitle>
        <CardDescription>积分变动记录</CardDescription>
      </CardHeader>
      <CardContent>
        {!data?.transactions.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>暂无积分记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    {typeLabels[tx.type] || tx.type}
                  </div>
                  {tx.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {tx.description}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    余额 {tx.balance}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {new Date(tx.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}

            {data.totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground flex items-center px-2">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReferralPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          推广中心
        </h1>
        <p className="text-muted-foreground mt-1">
          创建推广链接，邀请新用户注册赚取积分
        </p>
      </div>

      <StatsCards />

      <Tabs defaultValue="links">
        <TabsList>
          <TabsTrigger value="links">推广链接</TabsTrigger>
          <TabsTrigger value="referrals">推广用户</TabsTrigger>
          <TabsTrigger value="points">积分流水</TabsTrigger>
        </TabsList>
        <TabsContent value="links" className="mt-4">
          <LinksManager />
        </TabsContent>
        <TabsContent value="referrals" className="mt-4">
          <ReferralsList />
        </TabsContent>
        <TabsContent value="points" className="mt-4">
          <PointsHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
