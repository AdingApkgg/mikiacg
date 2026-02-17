"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Gamepad2,
  Search,
  Eye,
  ThumbsUp,
  Heart,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Calendar,
  Tag,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatViews } from "@/lib/format";

type GameStatus = "PENDING" | "PUBLISHED" | "REJECTED";
type StatusFilter = "ALL" | GameStatus;

interface GameItem {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  gameType: string | null;
  isFree: boolean;
  version: string | null;
  views: number;
  status: string;
  createdAt: Date;
  uploader: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
  };
  tags: { tag: { id: string; name: string } }[];
  _count: {
    likes: number;
    favorites: number;
  };
}

export default function DashboardGamesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPage = parseInt(searchParams.get("page") || "1");
  const initialStatus = (searchParams.get("status") || "ALL") as StatusFilter;
  const initialSearch = searchParams.get("q") || "";

  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<"delete" | null>(null);
  const [selectAllLoading, setSelectAllLoading] = useState(false);

  const limit = 50;
  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getGameStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("video:moderate"),
  });

  const { data, isLoading, isFetching } = trpc.admin.listAllGames.useQuery(
    { page, limit, search: search || undefined, status: statusFilter },
    { enabled: permissions?.scopes.includes("video:moderate") }
  );

  const moderateMutation = trpc.admin.moderateGame.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.status === "PUBLISHED" ? "游戏已通过审核" : "游戏已拒绝");
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message || "操作失败"),
  });

  const deleteMutation = trpc.admin.deleteGame.useMutation({
    onSuccess: () => {
      toast.success("游戏已删除");
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setDeletingId(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "删除失败"),
  });

  const batchModerateMutation = trpc.admin.batchModerateGames.useMutation({
    onSuccess: (result: { count: number }) => {
      toast.success(`已处理 ${result.count} 个游戏`);
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量操作失败"),
  });

  const batchDeleteMutation = trpc.admin.batchDeleteGames.useMutation({
    onSuccess: (result: { count: number }) => {
      toast.success(`已删除 ${result.count} 个游戏`);
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量删除失败"),
  });

  const games = useMemo(
    () => (data?.games || []) as unknown as GameItem[],
    [data?.games]
  );

  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.currentPage ?? 1;

  const updateUrl = useCallback((params: { page?: number; status?: string; q?: string }) => {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "1" && value !== "ALL" && value !== "") {
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
    const pageIds = new Set(games.map((g) => g.id));
    const allPageSelected = games.every((g) => selectedIds.has(g.id));

    if (allPageSelected) {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.delete(id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.add(id));
      setSelectedIds(newSet);
    }
  }, [games, selectedIds]);

  const selectAll = async () => {
    setSelectAllLoading(true);
    try {
      const result = await utils.admin.getAllGameIds.fetch({
        status: statusFilter,
        search: search || undefined,
      });
      setSelectedIds(new Set(result));
      toast.success(`已选择全部 ${result.length} 个游戏`);
    } catch {
      toast.error("获取游戏列表失败");
    } finally {
      setSelectAllLoading(false);
    }
  };

  const deselectAll = () => setSelectedIds(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: newPage, status: statusFilter, q: search });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    updateUrl({ page: 1, status: value, q: search });
  };

  const getStatusBadge = (status: GameStatus) => {
    switch (status) {
      case "PUBLISHED":
        return <Badge className="bg-green-500">已发布</Badge>;
      case "PENDING":
        return <Badge variant="secondary">待审核</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">已拒绝</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canModerate = permissions?.scopes.includes("video:moderate");
  const canManage = permissions?.scopes.includes("video:manage");
  const isPageAllSelected = games.length > 0 && games.every((g) => selectedIds.has(g.id));

  if (!canModerate) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有游戏管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5" />
          <h1 className="text-xl font-semibold">游戏管理</h1>
          <Badge variant="outline" className="ml-2">{totalCount} 个</Badge>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">总计</span>
              <Badge variant="outline">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已发布</span>
              <Badge className="bg-green-500">{stats.published}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">待审核</span>
              <Badge variant="secondary">{stats.pending}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已拒绝</span>
              <Badge variant="destructive">{stats.rejected}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索游戏标题或描述..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setTimeout(() => {
                setSearch(e.target.value);
                setPage(1);
                updateUrl({ page: 1, q: e.target.value, status: statusFilter });
              }, 300);
            }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="PENDING">待审核</SelectItem>
            <SelectItem value="PUBLISHED">已发布</SelectItem>
            <SelectItem value="REJECTED">已拒绝</SelectItem>
          </SelectContent>
        </Select>
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
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            disabled={selectAllLoading}
            className="gap-1"
            title={`选择所有 ${totalCount} 个游戏`}
          >
            {selectAllLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
            全选 ({totalCount})
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
              <Button
                variant="outline"
                size="sm"
                className="text-green-600"
                onClick={() =>
                  batchModerateMutation.mutate({
                    gameIds: Array.from(selectedIds),
                    status: "PUBLISHED",
                  })
                }
                disabled={batchModerateMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                批量通过
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-orange-600"
                onClick={() =>
                  batchModerateMutation.mutate({
                    gameIds: Array.from(selectedIds),
                    status: "REJECTED",
                  })
                }
                disabled={batchModerateMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" />
                批量拒绝
              </Button>
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

      {/* 游戏列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到游戏
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {games.map((game) => {
              const isSelected = selectedIds.has(game.id);
              const isExpanded = expandedIds.has(game.id);

              return (
                <Card
                  key={game.id}
                  className={cn(
                    "transition-colors",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(game.id)}
                        className="mt-1"
                      />

                      {/* 封面 */}
                      <div className="relative w-20 h-[104px] rounded-lg bg-muted overflow-hidden shrink-0">
                        {game.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={game.coverUrl.startsWith("/uploads/") ? game.coverUrl : `/api/cover/${encodeURIComponent(game.coverUrl)}`}
                            alt={game.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Gamepad2 className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                        )}
                        {game.gameType && (
                          <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded">
                            {game.gameType}
                          </div>
                        )}
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/game/${game.id}`}
                              className="font-medium hover:underline line-clamp-1"
                            >
                              {game.title}
                            </Link>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={game.uploader.avatar || undefined} />
                                <AvatarFallback className="text-xs">
                                  {(game.uploader.nickname || game.uploader.username).charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <Link href={`/user/${game.uploader.id}`} className="hover:underline">
                                {game.uploader.nickname || game.uploader.username}
                              </Link>
                              <span>·</span>
                              <span>{formatRelativeTime(game.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {formatViews(game.views)}
                              </span>
                              <span className="flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3" />
                                {game._count.likes}
                              </span>
                              <span className="flex items-center gap-1">
                                <Heart className="h-3 w-3" />
                                {game._count.favorites}
                              </span>
                              {game.version && (
                                <span className="text-muted-foreground/70">
                                  {game.version}
                                </span>
                              )}
                              {!game.isFree && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-400">
                                  付费
                                </Badge>
                              )}
                            </div>
                          </div>
                          {getStatusBadge(game.status as GameStatus)}
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1 mt-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/game/${game.id}`} target="_blank">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              查看
                            </Link>
                          </Button>
                          {game.status !== "PUBLISHED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600"
                              onClick={() =>
                                moderateMutation.mutate({
                                  gameId: game.id,
                                  status: "PUBLISHED",
                                })
                              }
                              disabled={moderateMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              通过
                            </Button>
                          )}
                          {game.status !== "REJECTED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600"
                              onClick={() =>
                                moderateMutation.mutate({
                                  gameId: game.id,
                                  status: "REJECTED",
                                })
                              }
                              disabled={moderateMutation.isPending}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              拒绝
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeletingId(game.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              删除
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-auto"
                            onClick={() => toggleExpand(game.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* 展开的详细信息 */}
                    <Collapsible open={isExpanded}>
                      <CollapsibleContent>
                        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="font-medium text-foreground mb-1">游戏 ID</div>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{game.id}</code>
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                创建时间
                              </div>
                              {new Date(game.createdAt).toLocaleString("zh-CN")}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">类型</div>
                              {game.gameType || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">版本</div>
                              {game.version || "-"}
                            </div>
                          </div>

                          {game.description && (
                            <div>
                              <div className="font-medium text-foreground mb-1">描述</div>
                              <p className="text-sm whitespace-pre-wrap line-clamp-5">{game.description}</p>
                            </div>
                          )}

                          {game.tags && game.tags.length > 0 && (
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                标签
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {game.tags.map((t) => (
                                  <Badge key={t.tag.id} variant="outline" className="text-xs">
                                    {t.tag.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
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
                第 {currentPage} 页，共 {totalPages} 页（{totalCount} 个游戏）
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
            <AlertDialogTitle>确定要删除这个游戏吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，游戏及其所有关联数据将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ gameId: deletingId })}
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
              将永久删除 {selectedIds.size} 个游戏及其所有关联数据，此操作不可恢复！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ gameIds: Array.from(selectedIds) })}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
