"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "@/lib/toast-with-sound";
import {
  Layers,
  Search,
  Eye,
  Video,
  Trash2,
  Loader2,
  ExternalLink,
  Edit,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatDuration } from "@/lib/format";
import { getCoverUrl } from "@/lib/cover";

interface SeriesItem {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  downloadUrl: string | null;
  downloadNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
  };
  _count: { episodes: number };
  episodes: {
    video: {
      id: string;
      coverUrl: string | null;
      title: string;
    };
  }[];
}

interface EditSeriesData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  downloadUrl: string;
  downloadNote: string;
}

export default function AdminSeriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPage = parseInt(searchParams.get("page") || "1");
  const initialSearch = searchParams.get("q") || "";

  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<"delete" | null>(null);

  // 编辑对话框
  const [editData, setEditData] = useState<EditSeriesData | null>(null);

  const limit = 50;
  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getSeriesStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("video:moderate"),
  });

  const { data, isLoading, isFetching } = trpc.admin.listAllSeries.useQuery(
    { page, limit, search: search || undefined },
    { enabled: permissions?.scopes.includes("video:moderate") }
  );

  const deleteMutation = trpc.admin.adminDeleteSeries.useMutation({
    onSuccess: () => {
      toast.success("合集已删除");
      utils.admin.listAllSeries.invalidate();
      utils.admin.getSeriesStats.invalidate();
      setDeletingId(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "删除失败"),
  });

  const batchDeleteMutation = trpc.admin.adminBatchDeleteSeries.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已删除 ${result.count} 个合集`);
      utils.admin.listAllSeries.invalidate();
      utils.admin.getSeriesStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量删除失败"),
  });

  const updateMutation = trpc.admin.adminUpdateSeries.useMutation({
    onSuccess: () => {
      toast.success("合集已更新");
      utils.admin.listAllSeries.invalidate();
      setEditData(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "更新失败"),
  });

  const removeEpisodeMutation = trpc.admin.adminRemoveEpisode.useMutation({
    onSuccess: () => {
      toast.success("剧集已移除");
      utils.admin.listAllSeries.invalidate();
      utils.admin.getSeriesStats.invalidate();
      expandedDetailRefetch();
    },
    onError: (error: { message: string }) => toast.error(error.message || "移除失败"),
  });

  const seriesList = useMemo(
    () => (data?.series || []) as unknown as SeriesItem[],
    [data?.series]
  );

  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.currentPage ?? 1;

  // 展开的合集详情查询
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: seriesDetail, refetch: expandedDetailRefetch } = trpc.admin.getSeriesDetail.useQuery(
    { id: detailId! },
    { enabled: !!detailId }
  );

  const updateUrl = useCallback((params: { page?: number; q?: string }) => {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "1" && value !== "") {
        url.searchParams.set(key, String(value));
      } else {
        url.searchParams.delete(key);
      }
    });
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePageSelect = useCallback(() => {
    const pageIds = new Set(seriesList.map((s) => s.id));
    const allPageSelected = seriesList.every((s) => selectedIds.has(s.id));

    if (allPageSelected) {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.delete(id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.add(id));
      setSelectedIds(newSet);
    }
  }, [seriesList, selectedIds]);

  const deselectAll = () => setSelectedIds(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setDetailId((d) => (d === id ? null : d));
      } else {
        next.add(id);
        setDetailId(id);
      }
      return next;
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: newPage, q: search });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEdit = (series: SeriesItem) => {
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
      description: editData.description || null,
      coverUrl: editData.coverUrl || null,
      downloadUrl: editData.downloadUrl || null,
      downloadNote: editData.downloadNote || null,
    });
  };

  const canModerate = permissions?.scopes.includes("video:moderate");
  const canManage = permissions?.scopes.includes("video:manage");
  const isPageAllSelected = seriesList.length > 0 && seriesList.every((s) => selectedIds.has(s.id));

  if (!canModerate) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有合集管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          <h1 className="text-xl font-semibold">合集管理</h1>
          <Badge variant="outline" className="ml-2">{totalCount} 个</Badge>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">合集</span>
              <Badge variant="outline">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">总集数</span>
              <Badge variant="secondary">{stats.totalEpisodes}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* 搜索 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索合集标题或描述..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setTimeout(() => {
                setSearch(e.target.value);
                setPage(1);
                updateUrl({ page: 1, q: e.target.value });
              }, 300);
            }}
            className="pl-10"
          />
        </div>
      </div>

      {/* 批量操作栏 */}
      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePageSelect}
            className="gap-1"
            title="选择/取消本页"
          >
            {isPageAllSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            本页
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              取消全选
            </Button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <>
            <span className="text-sm text-muted-foreground">
              已选 {selectedIds.size} 个
            </span>
            <div className="flex items-center gap-2 ml-auto">
              {canManage && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchAction("delete")}
                  disabled={batchDeleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  批量删除
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* 合集列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : seriesList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到合集
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {seriesList.map((series) => {
              const isSelected = selectedIds.has(series.id);
              const isExpanded = expandedIds.has(series.id);
              const firstEpisodeCover = series.episodes?.[0]?.video;
              const coverSrc = series.coverUrl
                ? getCoverUrl("", series.coverUrl, { w: 260 })
                : firstEpisodeCover
                ? getCoverUrl(firstEpisodeCover.id, firstEpisodeCover.coverUrl, { w: 260 })
                : null;

              return (
                <Card
                  key={series.id}
                  className={cn(
                    "transition-colors",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(series.id)}
                        className="mt-1"
                      />

                      {/* 封面 */}
                      <div className="relative w-32 h-20 rounded-lg bg-muted overflow-hidden shrink-0">
                        {coverSrc ? (
                          <Image
                            src={coverSrc}
                            alt={series.title}
                            fill
                            className="object-cover"
                            sizes="128px"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Layers className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                          {series._count.episodes} 集
                        </div>
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/series/${series.id}`}
                              className="font-medium hover:underline line-clamp-1"
                            >
                              {series.title}
                            </Link>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={series.creator.avatar || undefined} />
                                <AvatarFallback className="text-xs">
                                  {(series.creator.nickname || series.creator.username).charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <Link href={`/user/${series.creator.id}`} className="hover:underline">
                                {series.creator.nickname || series.creator.username}
                              </Link>
                              <span>·</span>
                              <span>{formatRelativeTime(series.updatedAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Video className="h-3 w-3" />
                                {series._count.episodes} 集
                              </span>
                              {series.downloadUrl && (
                                <span className="flex items-center gap-1 text-green-600">
                                  <Download className="h-3 w-3" />
                                  有下载
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1 mt-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/series/${series.id}`} target="_blank">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              查看
                            </Link>
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(series)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                编辑
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setDeletingId(series.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                删除
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-auto"
                            onClick={() => toggleExpand(series.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {/* 封面链接 */}
                        <div className="flex flex-col gap-0.5 mt-1.5 text-[11px] text-muted-foreground font-mono">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="shrink-0 text-muted-foreground/60">封面</span>
                            {series.coverUrl ? (
                              <a href={series.coverUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:underline hover:text-foreground" title={series.coverUrl}>
                                {series.coverUrl}
                              </a>
                            ) : (
                              <span className="text-muted-foreground/40">未设置（使用首集封面）</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 展开的剧集列表 */}
                    <Collapsible open={isExpanded}>
                      <CollapsibleContent>
                        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="font-medium text-foreground mb-1">合集 ID</div>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{series.id}</code>
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                创建时间
                              </div>
                              {new Date(series.createdAt).toLocaleString("zh-CN")}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">最后更新</div>
                              {new Date(series.updatedAt).toLocaleString("zh-CN")}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">集数</div>
                              {series._count.episodes}
                            </div>
                          </div>

                          {series.description && (
                            <div>
                              <div className="font-medium text-foreground mb-1">描述</div>
                              <p className="text-sm whitespace-pre-wrap line-clamp-5">{series.description}</p>
                            </div>
                          )}

                          {series.downloadUrl && (
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                下载链接
                              </div>
                              <a href={series.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                                {series.downloadUrl}
                              </a>
                              {series.downloadNote && (
                                <p className="text-sm text-muted-foreground mt-1">{series.downloadNote}</p>
                              )}
                            </div>
                          )}

                          {/* 剧集列表 */}
                          <div>
                            <div className="font-medium text-foreground mb-2">剧集列表</div>
                            {detailId === series.id && seriesDetail ? (
                              <div className="space-y-2">
                                {seriesDetail.episodes.map((ep) => (
                                  <div
                                    key={ep.id}
                                    className="flex items-center gap-3 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                                  >
                                    <div className="relative w-16 h-10 rounded bg-muted overflow-hidden shrink-0">
                                      <Image
                                        src={getCoverUrl(ep.video.id, ep.video.coverUrl, { w: 160 })}
                                        alt={ep.video.title}
                                        fill
                                        className="object-cover"
                                        sizes="64px"
                                        unoptimized
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                          第{ep.episodeNum}集
                                        </Badge>
                                        <Link
                                          href={`/video/${ep.video.id}`}
                                          className="text-sm hover:underline truncate"
                                          target="_blank"
                                        >
                                          {ep.episodeTitle || ep.video.title}
                                        </Link>
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 font-mono">
                                        <span className="text-muted-foreground/60">源</span>
                                        <span className="truncate">{ep.video.videoUrl}</span>
                                      </div>
                                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                                        <span className="flex items-center gap-1">
                                          <Eye className="h-3 w-3" />
                                          {ep.video.views}
                                        </span>
                                        {ep.video.duration && (
                                          <span>{formatDuration(ep.video.duration)}</span>
                                        )}
                                        <Badge
                                          variant={ep.video.status === "PUBLISHED" ? "default" : "secondary"}
                                          className={cn(
                                            "text-[10px] px-1 py-0",
                                            ep.video.status === "PUBLISHED" && "bg-green-500"
                                          )}
                                        >
                                          {ep.video.status === "PUBLISHED" ? "已发布" : ep.video.status === "PENDING" ? "待审" : "已拒绝"}
                                        </Badge>
                                      </div>
                                    </div>
                                    {canManage && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive shrink-0"
                                        title="从合集移除"
                                        onClick={() =>
                                          removeEpisodeMutation.mutate({
                                            seriesId: series.id,
                                            videoId: ep.video.id,
                                          })
                                        }
                                        disabled={removeEpisodeMutation.isPending}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                {seriesDetail.episodes.length === 0 && (
                                  <p className="text-sm text-muted-foreground text-center py-4">
                                    合集暂无剧集
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 py-4 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">加载中...</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <div className="text-sm text-muted-foreground">
                第 {currentPage} 页，共 {totalPages} 页（{totalCount} 个合集）
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1 || isFetching}
                  title="第一页"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || isFetching}
                  title="上一页"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="icon"
                        onClick={() => handlePageChange(pageNum)}
                        disabled={isFetching}
                        className="w-9 h-9"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || isFetching}
                  title="下一页"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages || isFetching}
                  title="最后一页"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* 加载中遮罩 */}
          {isFetching && !isLoading && (
            <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </>
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除这个合集吗？</AlertDialogTitle>
            <AlertDialogDescription>
              合集将被删除，但其中的视频不会受影响。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ seriesId: deletingId })}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={batchAction === "delete"} onOpenChange={() => setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定批量删除吗？</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive">
              将永久删除 {selectedIds.size} 个合集，视频不会受影响，此操作不可恢复！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ seriesIds: Array.from(selectedIds) })}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 编辑合集对话框 */}
      <Dialog open={!!editData} onOpenChange={() => setEditData(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑合集</DialogTitle>
            <DialogDescription>
              修改合集信息
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
                <Label htmlFor="edit-download">下载链接</Label>
                <Input
                  id="edit-download"
                  value={editData.downloadUrl}
                  onChange={(e) =>
                    setEditData({ ...editData, downloadUrl: e.target.value })
                  }
                  placeholder="https://pan.baidu.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-download-note">下载提示</Label>
                <Textarea
                  id="edit-download-note"
                  value={editData.downloadNote}
                  onChange={(e) =>
                    setEditData({ ...editData, downloadNote: e.target.value })
                  }
                  placeholder="解压密码、使用说明等..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditData(null)}>
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
