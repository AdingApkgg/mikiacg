"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { History, Loader2, Trash2, X, CheckSquare, Eye, Clock, Play, Gamepad2, Images } from "lucide-react";
import { toast } from "@/lib/toast-with-sound";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import Image from "next/image";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { getCoverUrl } from "@/lib/cover";
import { Pagination } from "@/components/ui/pagination";
import { GameCard, type GameCardData } from "@/components/game/game-card";
import { ImagePostCard } from "@/components/image/image-post-card";
import { cn } from "@/lib/utils";
import { useSound } from "@/hooks/use-sound";

type ContentTab = "video" | "game" | "image";

const contentTabs: { key: ContentTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "video", label: "视频", icon: Play },
  { key: "game", label: "游戏", icon: Gamepad2 },
  { key: "image", label: "图片", icon: Images },
];

export default function HistoryClient({ page }: { page: number }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { play } = useSound();

  const [activeTab, setActiveTab] = useState<ContentTab>("video");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [gamePage, setGamePage] = useState(1);
  const [imagePage, setImagePage] = useState(1);

  const userId = session?.user?.id;

  const { data, isLoading } = trpc.video.getHistory.useQuery(
    { limit: 20, page },
    { enabled: !!session && activeTab === "video" }
  );

  const { data: gameData, isLoading: gameLoading } = trpc.game.getUserHistory.useQuery(
    { userId: userId!, limit: 20, page: gamePage },
    { enabled: !!userId && activeTab === "game" }
  );

  const { data: imageData, isLoading: imageLoading } = trpc.image.getUserHistory.useQuery(
    { userId: userId!, limit: 20, page: imagePage },
    { enabled: !!userId && activeTab === "image" }
  );

  const removeHistoryItemMutation = trpc.video.removeHistoryItem.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  const batchRemoveHistoryMutation = trpc.video.batchRemoveHistory.useMutation({
    onSuccess: (data) => {
      toast.success(`已删除 ${data.count} 条记录`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  const clearHistoryMutation = trpc.video.clearHistory.useMutation({
    onSuccess: () => {
      toast.success("观看历史已清空");
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("清空失败");
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/history");
    }
  }, [status, router]);

  const handleTabChange = (tab: ContentTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSelectMode(false);
    setSelectedIds(new Set());
    play("navigate");
  };

  if (status === "loading") {
    return (
      <div className="px-4 md:px-6 py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const history = data?.history ?? [];
  const totalPages = data?.totalPages ?? 1;

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(v => v.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchRemoveHistoryMutation.mutate({ videoIds: Array.from(selectedIds) });
  };

  const groupByDate = (items: typeof history) => {
    const groups: { date: string; label: string; items: typeof history }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    items.forEach((item) => {
      const itemDate = new Date(item.watchedAt);
      itemDate.setHours(0, 0, 0, 0);

      let label: string;
      let dateKey: string;

      if (itemDate.getTime() === today.getTime()) {
        label = "今天";
        dateKey = "today";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        label = "昨天";
        dateKey = "yesterday";
      } else if (itemDate.getTime() > thisWeek.getTime()) {
        label = "本周";
        dateKey = "week";
      } else {
        label = itemDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
        dateKey = itemDate.toISOString().split("T")[0];
      }

      const existingGroup = groups.find(g => g.date === dateKey);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.push({ date: dateKey, label, items: [item] });
      }
    });

    return groups;
  };

  const groupedHistory = groupByDate(history);

  return (
    <div className="px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-blue-500" />
          <h1 className="text-2xl font-bold">浏览历史</h1>
        </div>

        {activeTab === "video" && history.length > 0 && (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  {selectedIds.size === history.length ? "取消全选" : "全选"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selectedIds.size === 0 || batchRemoveHistoryMutation.isPending}
                    >
                      {batchRemoveHistoryMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      删除 ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除历史记录</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除选中的 {selectedIds.size} 条历史记录吗？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchDelete}>确定</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                  管理
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      清空全部
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定要清空观看历史吗？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作不可撤销，所有观看记录将被永久删除。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearHistoryMutation.mutate()}
                        disabled={clearHistoryMutation.isPending}
                      >
                        {clearHistoryMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        确定清空
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        )}
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

      {/* Video Tab */}
      {activeTab === "video" && (
        <>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : history.length === 0 && page === 1 ? (
            <EmptyState
              icon={History}
              title="还没有观看任何视频"
              description="开始探索精彩的 ACGN 内容吧"
              action={{
                label: "去发现视频",
                onClick: () => router.push("/"),
              }}
            />
          ) : (
            <>
              {groupedHistory.map((group) => (
                <div key={group.date} className="mb-6">
                  <h2 className="text-sm font-medium text-muted-foreground mb-3 sticky top-16 bg-background py-2 z-10">
                    {group.label}
                  </h2>
                  <div className="space-y-3">
                    {group.items.map((video) => (
                      <div
                        key={video.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        {selectMode && (
                          <Checkbox
                            checked={selectedIds.has(video.id)}
                            onCheckedChange={() => toggleSelect(video.id)}
                            className="shrink-0"
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
                          <Link
                            href={`/video/${video.id}`}
                            className="font-medium hover:text-primary line-clamp-2"
                          >
                            {video.title}
                          </Link>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Link href={`/user/${video.uploader.id}`} className="hover:text-primary">
                              {video.uploader.nickname || video.uploader.username}
                            </Link>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {formatViews(video.views)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(video.watchedAt)}
                            </span>
                          </div>
                        </div>

                        {!selectMode && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={() => removeHistoryItemMutation.mutate({ videoId: video.id })}
                            disabled={removeHistoryItemMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath="/history"
                className="mt-8"
              />
            </>
          )}
        </>
      )}

      {/* Game Tab */}
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
              title="还没有浏览过任何游戏"
              description="去游戏区看看有什么好玩的吧"
              action={{
                label: "去发现游戏",
                onClick: () => router.push("/games"),
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

      {/* Image Tab */}
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
              title="还没有浏览过任何图片"
              description="去图片区看看有什么有趣的吧"
              action={{
                label: "去发现图片",
                onClick: () => router.push("/images"),
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
    </div>
  );
}
