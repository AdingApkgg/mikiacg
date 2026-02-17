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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "@/lib/toast-with-sound";
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
  Edit2,
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
  Replace,
  BookTemplate,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatViews } from "@/lib/format";

type GameStatus = "PENDING" | "PUBLISHED" | "REJECTED";
type StatusFilter = "ALL" | GameStatus;

type GameRegexField =
  | "title" | "description" | "coverUrl" | "gameType" | "version"
  | "extraInfo.downloads.url" | "extraInfo.downloads.name" | "extraInfo.downloads.password"
  | "extraInfo.screenshots" | "extraInfo.videos"
  | "extraInfo.originalName" | "extraInfo.authorUrl" | "extraInfo.characterIntro";

interface RegexTemplate {
  name: string;
  description: string;
  field: GameRegexField;
  pattern: string;
  replacement: string;
  flags: string;
}

const REGEX_TEMPLATES: RegexTemplate[] = [
  // 标题
  {
    name: "去除标题方括号标记",
    description: "去除标题中的 [汉化]、[中文] 等方括号标记",
    field: "title",
    pattern: "\\s*\\[.*?\\]\\s*",
    replacement: " ",
    flags: "g",
  },
  {
    name: "去除标题圆括号标记",
    description: "去除标题中的 (汉化)、(完结) 等圆括号标记",
    field: "title",
    pattern: "\\s*\\(.*?\\)\\s*",
    replacement: " ",
    flags: "g",
  },
  {
    name: "去除标题首尾空白",
    description: "去除标题首尾的空格、制表符等空白字符",
    field: "title",
    pattern: "^\\s+|\\s+$",
    replacement: "",
    flags: "g",
  },
  {
    name: "合并标题连续空格",
    description: "将标题中多个连续空格合并为单个空格",
    field: "title",
    pattern: "\\s{2,}",
    replacement: " ",
    flags: "g",
  },
  // 封面
  {
    name: "封面 HTTP→HTTPS",
    description: "将封面 URL 中的 http:// 替换为 https://",
    field: "coverUrl",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
  {
    name: "封面 URL 补全协议",
    description: "为以 // 开头的封面 URL 补全 https: 协议",
    field: "coverUrl",
    pattern: "^\\/\\/",
    replacement: "https://",
    flags: "",
  },
  {
    name: "去除封面 URL 查询参数",
    description: "移除封面 URL 中 ? 后的所有查询参数",
    field: "coverUrl",
    pattern: "\\?.*$",
    replacement: "",
    flags: "",
  },
  // 游戏类型 & 版本
  {
    name: "统一游戏类型为大写",
    description: "将小写类型名（如 slg）替换为大写（请修改具体类型）",
    field: "gameType",
    pattern: "^slg$",
    replacement: "SLG",
    flags: "i",
  },
  {
    name: "规范版本号前缀",
    description: "为缺少 Ver/v 前缀的纯数字版本号添加 v 前缀",
    field: "version",
    pattern: "^(\\d)",
    replacement: "v$1",
    flags: "",
  },
  {
    name: "统一版本号前缀为 v",
    description: "将 Ver1.0、V1.0 统一为 v1.0",
    field: "version",
    pattern: "^[Vv]er\\.?|^V",
    replacement: "v",
    flags: "",
  },
  // 描述
  {
    name: "清空描述中 HTML 标签",
    description: "移除描述中所有 HTML 标签，只保留文本内容",
    field: "description",
    pattern: "<[^>]*>",
    replacement: "",
    flags: "g",
  },
  // 下载链接
  {
    name: "下载链接 HTTP→HTTPS",
    description: "将下载链接中的 http:// 替换为 https://",
    field: "extraInfo.downloads.url",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
  {
    name: "替换下载链接域名",
    description: "替换下载链接中的域名（请修改域名）",
    field: "extraInfo.downloads.url",
    pattern: "https://old\\.example\\.com",
    replacement: "https://new.example.com",
    flags: "g",
  },
  {
    name: "去除下载链接查询参数",
    description: "移除下载链接中 ? 后的所有查询参数",
    field: "extraInfo.downloads.url",
    pattern: "\\?.*$",
    replacement: "",
    flags: "",
  },
  // 截图链接
  {
    name: "截图链接 HTTP→HTTPS",
    description: "将截图链接中的 http:// 替换为 https://",
    field: "extraInfo.screenshots",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
  {
    name: "替换截图 CDN 域名",
    description: "替换截图链接中的 CDN 域名（请修改域名）",
    field: "extraInfo.screenshots",
    pattern: "https://old-cdn\\.example\\.com",
    replacement: "https://cdn.mikiacg.vip",
    flags: "g",
  },
  {
    name: "去除截图链接查询参数",
    description: "移除截图链接中 ? 后的查询参数",
    field: "extraInfo.screenshots",
    pattern: "\\?.*$",
    replacement: "",
    flags: "",
  },
  // 视频链接
  {
    name: "视频链接 HTTP→HTTPS",
    description: "将视频链接中的 http:// 替换为 https://",
    field: "extraInfo.videos",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
  {
    name: "替换视频 CDN 域名",
    description: "替换视频链接中的 CDN 域名（请修改域名）",
    field: "extraInfo.videos",
    pattern: "https://old-cdn\\.example\\.com",
    replacement: "https://cdn.mikiacg.vip",
    flags: "g",
  },
  // 作者链接
  {
    name: "作者链接 HTTP→HTTPS",
    description: "将作者链接中的 http:// 替换为 https://",
    field: "extraInfo.authorUrl",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
];

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

  // 正则批量编辑状态
  const [regexOpen, setRegexOpen] = useState(false);
  const [regexField, setRegexField] = useState<GameRegexField>("title");
  const [regexPattern, setRegexPattern] = useState("");
  const [regexReplacement, setRegexReplacement] = useState("");
  const [regexFlags, setRegexFlags] = useState("g");
  const [regexPreviewing, setRegexPreviewing] = useState(false);
  const [regexPreviews, setRegexPreviews] = useState<{ id: string; title: string; before: string; after: string }[]>([]);
  const [regexPreviewStats, setRegexPreviewStats] = useState<{ totalMatched: number; totalSelected: number } | null>(null);

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
    onSuccess: (_: { success: boolean }, variables: { gameId: string; status: "PUBLISHED" | "REJECTED" }) => {
      toast.success(variables.status === "PUBLISHED" ? "游戏已通过审核" : "游戏已拒绝");
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "操作失败"),
  });

  const deleteMutation = trpc.admin.deleteGame.useMutation({
    onSuccess: () => {
      toast.success("游戏已删除");
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setDeletingId(null);
    },
    onError: (error: Error) => toast.error(error.message || "删除失败"),
  });

  const batchModerateMutation = trpc.admin.batchModerateGames.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已处理 ${result.count} 个游戏`);
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error: Error) => toast.error(error.message || "批量操作失败"),
  });

  const batchDeleteMutation = trpc.admin.batchDeleteGames.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已删除 ${result.count} 个游戏`);
      utils.admin.listAllGames.invalidate();
      utils.admin.getGameStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error: Error) => toast.error(error.message || "批量删除失败"),
  });

  const batchRegexUpdateMutation = trpc.admin.batchGameRegexUpdate.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已更新 ${result.count} 个游戏`);
      utils.admin.listAllGames.invalidate();
      setRegexOpen(false);
      setRegexPreviews([]);
      setRegexPreviewStats(null);
      setRegexPattern("");
      setRegexReplacement("");
    },
    onError: (error: Error) => toast.error(error.message || "批量编辑失败"),
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
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRegexPreviews([]);
                      setRegexPreviewStats(null);
                      setRegexOpen(true);
                    }}
                  >
                    <Replace className="h-4 w-4 mr-1" />
                    正则编辑
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBatchAction("delete")}
                    disabled={batchDeleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    批量删除
                  </Button>
                </>
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
            {games.map((game, index) => {
              const isSelected = selectedIds.has(game.id);
              const isExpanded = expandedIds.has(game.id);
              const itemNumber = totalCount - ((currentPage - 1) * limit + index);

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
                        <div className="absolute top-1 left-1 z-10 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                          #{itemNumber}
                        </div>
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
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/game/edit/${game.id}`}>
                              <Edit2 className="h-3 w-3 mr-1" />
                              编辑
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

      {/* 正则批量编辑对话框 */}
      <Dialog open={regexOpen} onOpenChange={(open) => {
        setRegexOpen(open);
        if (!open) {
          setRegexPreviews([]);
          setRegexPreviewStats(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>正则批量编辑</DialogTitle>
            <DialogDescription>
              对已选 {selectedIds.size} 个游戏使用正则表达式批量替换字段内容
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>目标字段</Label>
              <Select value={regexField} onValueChange={(v) => {
                setRegexField(v as typeof regexField);
                setRegexPreviews([]);
                setRegexPreviewStats(null);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">标题 (title)</SelectItem>
                  <SelectItem value="description">描述 (description)</SelectItem>
                  <SelectItem value="coverUrl">封面链接 (coverUrl)</SelectItem>
                  <SelectItem value="gameType">游戏类型 (gameType)</SelectItem>
                  <SelectItem value="version">版本号 (version)</SelectItem>
                  <SelectItem value="extraInfo.downloads.url">下载链接 (downloads.url)</SelectItem>
                  <SelectItem value="extraInfo.downloads.name">下载名称 (downloads.name)</SelectItem>
                  <SelectItem value="extraInfo.downloads.password">下载密码 (downloads.password)</SelectItem>
                  <SelectItem value="extraInfo.screenshots">截图链接 (screenshots)</SelectItem>
                  <SelectItem value="extraInfo.videos">视频链接 (videos)</SelectItem>
                  <SelectItem value="extraInfo.originalName">原作名 (originalName)</SelectItem>
                  <SelectItem value="extraInfo.authorUrl">作者链接 (authorUrl)</SelectItem>
                  <SelectItem value="extraInfo.characterIntro">角色介绍 (characterIntro)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 常用模版 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <BookTemplate className="h-3.5 w-3.5" />
                常用模版
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {REGEX_TEMPLATES.map((tpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border bg-muted/50 hover:bg-muted transition-colors text-foreground/80 hover:text-foreground"
                    title={tpl.description}
                    onClick={() => {
                      setRegexField(tpl.field);
                      setRegexPattern(tpl.pattern);
                      setRegexReplacement(tpl.replacement);
                      setRegexFlags(tpl.flags);
                      setRegexPreviews([]);
                      setRegexPreviewStats(null);
                      toast.success(`已填入模版: ${tpl.name}`);
                    }}
                  >
                    <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                    {tpl.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                点击模版一键填入正则和替换内容，填入后可按需微调
              </p>
            </div>

            <div className="space-y-2">
              <Label>匹配正则</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="例: \[汉化\]"
                  value={regexPattern}
                  onChange={(e) => {
                    setRegexPattern(e.target.value);
                    setRegexPreviews([]);
                    setRegexPreviewStats(null);
                  }}
                  className="flex-1 font-mono text-sm"
                />
                <Input
                  placeholder="flags"
                  value={regexFlags}
                  onChange={(e) => {
                    setRegexFlags(e.target.value);
                    setRegexPreviews([]);
                    setRegexPreviewStats(null);
                  }}
                  className="w-20 font-mono text-sm text-center"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                支持 JavaScript 正则语法，flags 默认 g（全局替换）。常用：gi（全局+忽略大小写）
              </p>
            </div>

            <div className="space-y-2">
              <Label>替换为</Label>
              <Input
                placeholder="留空则删除匹配内容"
                value={regexReplacement}
                onChange={(e) => {
                  setRegexReplacement(e.target.value);
                  setRegexPreviews([]);
                  setRegexPreviewStats(null);
                }}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                支持 $1, $2 等捕获组引用。留空则删除匹配内容
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={!regexPattern || regexPreviewing}
              onClick={async () => {
                setRegexPreviewing(true);
                try {
                  new RegExp(regexPattern, regexFlags);
                } catch {
                  toast.error("无效的正则表达式");
                  setRegexPreviewing(false);
                  return;
                }
                try {
                  const result = await utils.client.admin.batchGameRegexPreview.query({
                    gameIds: Array.from(selectedIds),
                    field: regexField,
                    pattern: regexPattern,
                    replacement: regexReplacement,
                    flags: regexFlags,
                  });
                  setRegexPreviews(result.previews);
                  setRegexPreviewStats({ totalMatched: result.totalMatched, totalSelected: result.totalSelected });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "预览失败");
                } finally {
                  setRegexPreviewing(false);
                }
              }}
            >
              {regexPreviewing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              预览变更
            </Button>

            {regexPreviewStats && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={regexPreviewStats.totalMatched > 0 ? "default" : "secondary"}>
                    {regexPreviewStats.totalMatched} / {regexPreviewStats.totalSelected} 个游戏将被修改
                  </Badge>
                </div>

                {regexPreviews.length > 0 && (
                  <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">游戏</th>
                          <th className="text-left p-2 font-medium text-red-600">替换前</th>
                          <th className="text-left p-2 font-medium text-green-600">替换后</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {regexPreviews.slice(0, 50).map((p) => (
                          <tr key={p.id} className="hover:bg-muted/30">
                            <td className="p-2 max-w-[120px] truncate" title={p.title}>
                              {p.title}
                            </td>
                            <td className="p-2 font-mono text-xs text-red-600 max-w-[200px] break-all">
                              {p.before.length > 100 ? p.before.slice(0, 100) + "..." : p.before}
                            </td>
                            <td className="p-2 font-mono text-xs text-green-600 max-w-[200px] break-all">
                              {p.after.length > 100 ? p.after.slice(0, 100) + "..." : p.after}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {regexPreviews.length > 50 && (
                      <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                        还有 {regexPreviews.length - 50} 条变更未显示
                      </div>
                    )}
                  </div>
                )}

                {regexPreviews.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    没有游戏匹配该正则表达式
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRegexOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                !regexPattern ||
                !regexPreviewStats ||
                regexPreviewStats.totalMatched === 0 ||
                batchRegexUpdateMutation.isPending
              }
              onClick={() => {
                batchRegexUpdateMutation.mutate({
                  gameIds: Array.from(selectedIds),
                  field: regexField,
                  pattern: regexPattern,
                  replacement: regexReplacement,
                  flags: regexFlags,
                });
              }}
            >
              {batchRegexUpdateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              应用变更 {regexPreviewStats ? `(${regexPreviewStats.totalMatched} 个)` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
