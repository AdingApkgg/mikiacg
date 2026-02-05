"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  Loader2,
  ExternalLink,
  Download,
  AlertCircle,
  Video,
  Eye,
} from "lucide-react";
import { useInView } from "react-intersection-observer";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { EmptyState } from "@/components/ui/empty-state";
import { getCoverUrl } from "@/lib/cover";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EditingSeriesData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  downloadUrl: string;
  downloadNote: string;
}

export default function MySeriesPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();
  const utils = trpc.useUtils();

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditingSeriesData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.series.listByUser.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const createMutation = trpc.series.create.useMutation({
    onSuccess: () => {
      toast.success("合集已创建");
      setIsCreating(false);
      setNewSeriesTitle("");
      utils.series.listByUser.invalidate();
    },
    onError: (error) => {
      toast.error("创建失败", { description: error.message });
    },
  });

  const updateMutation = trpc.series.update.useMutation({
    onSuccess: () => {
      toast.success("合集已更新");
      setEditingId(null);
      setEditData(null);
      utils.series.listByUser.invalidate();
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const deleteMutation = trpc.series.delete.useMutation({
    onSuccess: () => {
      toast.success("合集已删除");
      utils.series.listByUser.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/my-series");
    }
  }, [authStatus, router]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleEdit = (series: {
    id: string;
    title: string;
    description: string | null;
    coverUrl: string | null;
    downloadUrl?: string | null;
    downloadNote?: string | null;
  }) => {
    setEditingId(series.id);
    setEditData({
      id: series.id,
      title: series.title,
      description: series.description || "",
      coverUrl: series.coverUrl || "",
      downloadUrl: series.downloadUrl || "",
      downloadNote: series.downloadNote || "",
    });
  };

  const handleSave = () => {
    if (!editData) return;
    updateMutation.mutate({
      id: editData.id,
      title: editData.title,
      description: editData.description || undefined,
      coverUrl: editData.coverUrl || "",
      downloadUrl: editData.downloadUrl || "",
      downloadNote: editData.downloadNote || undefined,
    });
  };

  const handleCreate = () => {
    if (!newSeriesTitle.trim()) {
      toast.error("请输入合集标题");
      return;
    }
    createMutation.mutate({ title: newSeriesTitle.trim() });
  };

  if (authStatus === "loading" || isLoading) {
    return (
      <div className="px-4 md:px-6 py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const allSeries = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="px-4 md:px-6 py-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">我的合集</h1>
            <p className="text-sm text-muted-foreground">
              共 {allSeries.length} 个合集
            </p>
          </div>
        </div>

        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            创建合集
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新合集</DialogTitle>
              <DialogDescription>
                创建一个新合集来组织你的视频系列
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="new-title">合集标题</Label>
              <Input
                id="new-title"
                value={newSeriesTitle}
                onChange={(e) => setNewSeriesTitle(e.target.value)}
                placeholder="输入合集标题..."
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {allSeries.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="还没有创建任何合集"
          description="创建合集来组织你的视频系列，方便观众连续观看"
          action={{
            label: "创建第一个合集",
            onClick: () => setIsCreating(true),
          }}
        />
      ) : (
        <>
          <div className="space-y-3">
            {allSeries.map((series) => (
              <div
                key={series.id}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* 封面 */}
                <Link
                  href={`/series/${series.id}`}
                  className="relative w-32 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted"
                >
                  {series.firstEpisodeCover || series.coverUrl || series.episodes?.[0]?.video ? (
                    <Image
                      src={
                        series.coverUrl
                          ? getCoverUrl("", series.coverUrl)
                          : series.episodes?.[0]?.video
                          ? getCoverUrl(
                              series.episodes[0].video.id,
                              series.episodes[0].video.coverUrl
                            )
                          : "/placeholder.svg"
                      }
                      alt={series.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Layers className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                    {series.episodeCount} 集
                  </div>
                </Link>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/series/${series.id}`}
                        className="font-medium hover:text-primary line-clamp-1"
                      >
                        {series.title}
                      </Link>
                      {series.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {series.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          {series.episodeCount} 集
                        </span>
                        {series.downloadUrl && (
                          <span className="flex items-center gap-1 text-green-600">
                            <Download className="h-3 w-3" />
                            有下载链接
                          </span>
                        )}
                        <span>{formatRelativeTime(series.updatedAt)}</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(series)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/series/${series.id}`} target="_blank">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确定要删除这个合集吗？</AlertDialogTitle>
                            <AlertDialogDescription>
                              合集「{series.title}」将被删除，视频不会受影响。此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: series.id })}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div ref={ref} className="flex justify-center py-8">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        </>
      )}

      {/* 编辑对话框 */}
      <Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑合集</DialogTitle>
            <DialogDescription>
              修改合集信息，设置封面、描述和下载链接
            </DialogDescription>
          </DialogHeader>
          {editData && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">合集标题</Label>
                <Input
                  id="edit-title"
                  value={editData.title}
                  onChange={(e) =>
                    setEditData({ ...editData, title: e.target.value })
                  }
                  placeholder="输入合集标题..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">合集描述</Label>
                <Textarea
                  id="edit-description"
                  value={editData.description}
                  onChange={(e) =>
                    setEditData({ ...editData, description: e.target.value })
                  }
                  placeholder="输入合集描述..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-cover">封面链接</Label>
                <Input
                  id="edit-cover"
                  value={editData.coverUrl}
                  onChange={(e) =>
                    setEditData({ ...editData, coverUrl: e.target.value })
                  }
                  placeholder="https://example.com/cover.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  留空则自动使用第一集视频的封面
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-download-note" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  下载提示
                </Label>
                <Textarea
                  id="edit-download-note"
                  value={editData.downloadNote}
                  onChange={(e) =>
                    setEditData({ ...editData, downloadNote: e.target.value })
                  }
                  placeholder="例如：解压密码、使用说明等..."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  提示信息会显示在下载链接上方
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-download" className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-green-600" />
                  下载链接
                </Label>
                <Input
                  id="edit-download"
                  value={editData.downloadUrl}
                  onChange={(e) =>
                    setEditData({ ...editData, downloadUrl: e.target.value })
                  }
                  placeholder="https://pan.baidu.com/..."
                />
              </div>

              {editData.downloadUrl && (
                <Alert>
                  <Eye className="h-4 w-4" />
                  <AlertDescription>
                    预览：下载链接将显示在合集详情页
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
