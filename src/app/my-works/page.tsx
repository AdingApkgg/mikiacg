"use client";

import { Suspense } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Video,
  Plus,
  Edit,
  Trash2,
  Eye,
  Heart,
  Loader2,
  ExternalLink,
  MoreVertical,
  Search,
  CheckSquare,
  Square,
  X,
  MessageSquare,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Play,
  Gamepad2,
  Images,
} from "lucide-react";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast-with-sound";
import Link from "next/link";
import Image from "next/image";
import { EmptyState } from "@/components/ui/empty-state";
import { getCoverUrl } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { GameCard, type GameCardData } from "@/components/game/game-card";
import { ImagePostCard } from "@/components/image/image-post-card";
import { Pagination } from "@/components/ui/pagination";
import { useSound } from "@/hooks/use-sound";
import MySeriesClient from "@/app/my-series/client";

type ContentTab = "video" | "game" | "image" | "series";

const contentTabs: { key: ContentTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "video", label: "视频", icon: Play },
  { key: "game", label: "游戏", icon: Gamepad2 },
  { key: "image", label: "图片", icon: Images },
  { key: "series", label: "合集", icon: Layers },
];

const statusMap = {
  PUBLISHED: { label: "已发布", variant: "default" as const, color: "text-green-600" },
  PENDING: { label: "待审核", variant: "secondary" as const, color: "text-yellow-600" },
  REJECTED: { label: "已拒绝", variant: "destructive" as const, color: "text-red-600" },
  DELETED: { label: "已删除", variant: "outline" as const, color: "text-muted-foreground" },
};

type SortBy = "latest" | "views" | "likes";
type StatusFilter = "ALL" | "PUBLISHED" | "PENDING" | "REJECTED";

function MyVideosContent() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { play } = useSound();

  const [activeTab, setActiveTab] = useState<ContentTab>("video");

  // Video tab state
  const initialPage = parseInt(searchParams.get("page") || "1");
  const initialStatus = (searchParams.get("status") || "ALL") as StatusFilter;
  const initialSearch = searchParams.get("q") || "";
  const initialSort = (searchParams.get("sort") || "latest") as SortBy;

  const [page, setPage] = useState(initialPage);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [sortBy, setSortBy] = useState<SortBy>(initialSort);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllLoading, setSelectAllLoading] = useState(false);

  // Game/Image tab state
  const [gamePage, setGamePage] = useState(1);
  const [imagePage, setImagePage] = useState(1);

  const utils = trpc.useUtils();
  const userId = session?.user?.id;
  const limit = 50;

  const {
    data,
    isLoading,
    isFetching,
  } = trpc.video.getMyVideos.useQuery(
    { page, limit, status: statusFilter, search: searchQuery || undefined, sortBy },
    { enabled: !!session && activeTab === "video" }
  );

  const { data: gameData, isLoading: gameLoading } = trpc.user.getGames.useQuery(
    { userId: userId!, limit: 20, page: gamePage },
    { enabled: !!userId && activeTab === "game" }
  );

  const { data: imageData, isLoading: imageLoading } = trpc.image.getUserPosts.useQuery(
    { userId: userId!, limit: 20, page: imagePage },
    { enabled: !!userId && activeTab === "image" }
  );

  const deleteMutation = trpc.video.delete.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      utils.video.getMyVideos.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const batchDeleteMutation = trpc.video.batchDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`已删除 ${data.count} 个视频`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.video.getMyVideos.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const updateUrl = useCallback((params: { page?: number; status?: string; q?: string; sort?: string }) => {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== "1" && value !== "ALL" && value !== "latest" && value !== "") {
        url.searchParams.set(key, String(value));
      } else {
        url.searchParams.delete(key);
      }
    });
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/my-works");
    }
  }, [authStatus, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setSearchQuery(searchInput);
        setPage(1);
        updateUrl({ page: 1, q: searchInput, status: statusFilter, sort: sortBy });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, statusFilter, sortBy, updateUrl]);

  const handleTabChange = (tab: ContentTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSelectMode(false);
    setSelectedIds(new Set());
    play("navigate");
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate({ id });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const togglePageSelect = () => {
    if (!data?.videos) return;
    const pageIds = new Set(data.videos.map(v => v.id));
    const allPageSelected = data.videos.every(v => selectedIds.has(v.id));

    if (allPageSelected) {
      const newSet = new Set(selectedIds);
      pageIds.forEach(id => newSet.delete(id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      pageIds.forEach(id => newSet.add(id));
      setSelectedIds(newSet);
    }
  };

  const selectAll = async () => {
    setSelectAllLoading(true);
    try {
      const result = await utils.video.getMyVideoIds.fetch({
        status: statusFilter,
        search: searchQuery || undefined,
      });
      setSelectedIds(new Set(result));
      toast.success(`已选择全部 ${result.length} 个视频`);
    } catch {
      toast.error("获取视频列表失败");
    } finally {
      setSelectAllLoading(false);
    }
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    updateUrl({ page: newPage, status: statusFilter, q: searchQuery, sort: sortBy });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
    updateUrl({ page: 1, status: value, q: searchQuery, sort: sortBy });
  };

  const handleSortChange = (value: SortBy) => {
    setSortBy(value);
    setPage(1);
    updateUrl({ page: 1, status: statusFilter, q: searchQuery, sort: value });
  };

  if (authStatus === "loading") {
    return (
      <div className="px-4 md:px-6 py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const videos = data?.videos ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.currentPage ?? 1;
  const isPageAllSelected = videos.length > 0 && videos.every(v => selectedIds.has(v.id));

  return (
    <div className="px-4 md:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">我的作品</h1>
        </div>

        <Button asChild>
          <Link href="/upload">
            <Plus className="h-4 w-4 mr-2" />
            上传
          </Link>
        </Button>
      </div>

      {/* Content Type Tabs */}
      <div className="flex items-center gap-1 border-b mb-6 overflow-x-auto scrollbar-none">
        {contentTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== Video Tab ===== */}
      {activeTab === "video" && (
        <>
          {/* Video Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索视频..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  <SelectItem value="PUBLISHED">已发布</SelectItem>
                  <SelectItem value="PENDING">待审核</SelectItem>
                  <SelectItem value="REJECTED">已拒绝</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">最新发布</SelectItem>
                  <SelectItem value="views">播放最多</SelectItem>
                  <SelectItem value="likes">点赞最多</SelectItem>
                </SelectContent>
              </Select>

              {selectMode ? (
                <>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={togglePageSelect}
                      title="选择/取消本页"
                    >
                      {isPageAllSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      本页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                      disabled={selectAllLoading}
                      title="选择所有视频"
                    >
                      {selectAllLoading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <ChevronsRight className="h-4 w-4 mr-1" />
                      )}
                      全选 ({totalCount})
                    </Button>
                    {selectedIds.size > 0 && (
                      <Button variant="ghost" size="sm" onClick={deselectAll}>
                        取消全选
                      </Button>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                      >
                        {batchDeleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        删除 ({selectedIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>批量删除视频</AlertDialogTitle>
                        <AlertDialogDescription>
                          确定要删除选中的 {selectedIds.size} 个视频吗？此操作不可撤销。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBatchDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          确定删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectMode(false);
                      setSelectedIds(new Set());
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                  管理
                </Button>
              )}
            </div>
          </div>

          {selectMode && selectedIds.size > 0 && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
              <span className="text-sm">
                已选择 <strong>{selectedIds.size}</strong> 个视频
                {selectedIds.size !== videos.length && totalCount > limit && (
                  <span className="text-muted-foreground ml-2">
                    （可点击&ldquo;全选&rdquo;选择所有 {totalCount} 个）
                  </span>
                )}
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : videos.length === 0 && totalCount === 0 ? (
            <EmptyState
              icon={Video}
              title="还没有上传任何视频"
              description="分享你喜欢的 ACGN 内容，与大家一起交流"
              action={{
                label: "上传第一个视频",
                onClick: () => router.push("/upload"),
              }}
            />
          ) : videos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>没有找到匹配的视频</p>
              <Button variant="link" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>
                清除搜索
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group ${
                      selectedIds.has(video.id) ? 'bg-primary/5 border-primary/30' : ''
                    }`}
                  >
                    {selectMode && (
                      <Checkbox
                        checked={selectedIds.has(video.id)}
                        onCheckedChange={() => toggleSelect(video.id)}
                        className="mt-1 shrink-0"
                      />
                    )}

                    <Link
                      href={`/video/${video.id}`}
                      className="relative w-40 h-24 flex-shrink-0 rounded-md overflow-hidden bg-muted"
                    >
                      <Image
                        src={getCoverUrl(video.id, video.coverUrl, { w: 320 })}
                        alt={video.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                          {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
                        </div>
                      )}
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/video/${video.id}`}
                            className="font-medium hover:text-primary line-clamp-2"
                          >
                            {video.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge
                              variant={statusMap[video.status as keyof typeof statusMap]?.variant || "outline"}
                              className="text-xs"
                            >
                              {statusMap[video.status as keyof typeof statusMap]?.label || video.status}
                            </Badge>
                            {video.pages && (video.pages as unknown[]).length > 1 && (
                              <Badge variant="outline" className="text-xs">
                                <Layers className="h-3 w-3 mr-1" />
                                {(video.pages as unknown[]).length}P
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatViews(video.views)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {video._count.likes}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {video._count.comments || 0}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(video.createdAt)}
                            </span>
                          </div>
                        </div>

                        {!selectMode && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/video/${video.id}`} target="_blank">
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  查看视频
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/video/edit/${video.id}`}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  编辑视频
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    删除视频
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>确定要删除这个视频吗？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      视频「{video.title}」将被删除，此操作不可撤销。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(video.id)}
                                      disabled={deletingId === video.id}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deletingId === video.id && (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      )}
                                      删除
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <div className="text-sm text-muted-foreground">
                    第 {currentPage} 页，共 {totalPages} 页（{totalCount} 个视频）
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

              {isFetching && !isLoading && (
                <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ===== Game Tab ===== */}
      {activeTab === "game" && (
        <>
          {gameLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-video rounded-lg" />
              ))}
            </div>
          ) : (gameData?.games ?? []).length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title="还没有上传任何游戏"
              description="分享你喜欢的游戏，与大家一起体验"
              action={{
                label: "上传游戏",
                onClick: () => router.push("/upload"),
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(gameData?.games ?? [])
                  .filter((g): g is NonNullable<typeof g> => g?.id != null)
                  .map((game, index) => (
                    <GameCard key={game.id} game={game as GameCardData} index={index} />
                  ))}
              </div>
              <Pagination
                currentPage={gamePage}
                totalPages={gameData?.totalPages ?? 1}
                onPageChange={setGamePage}
                className="mt-8"
              />
            </>
          )}
        </>
      )}

      {/* ===== Image Tab ===== */}
      {activeTab === "image" && (
        <>
          {imageLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : (imageData?.posts ?? []).length === 0 ? (
            <EmptyState
              icon={Images}
              title="还没有上传任何图片"
              description="分享你喜欢的图片，与大家一起欣赏"
              action={{
                label: "上传图片",
                onClick: () => router.push("/upload"),
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(imageData?.posts ?? [])
                  .filter((p): p is NonNullable<typeof p> => p?.id != null)
                  .map((post, index) => (
                    <ImagePostCard key={post.id} post={post as Parameters<typeof ImagePostCard>[0]["post"]} index={index} />
                  ))}
              </div>
              <Pagination
                currentPage={imagePage}
                totalPages={imageData?.totalPages ?? 1}
                onPageChange={setImagePage}
                className="mt-8"
              />
            </>
          )}
        </>
      )}

      {/* ===== Series Tab ===== */}
      {activeTab === "series" && (
        <div className="-mx-4 md:-mx-6 -mb-6">
          <MySeriesClient page={1} />
        </div>
      )}
    </div>
  );
}

export default function MyVideosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <MyVideosContent />
    </Suspense>
  );
}
