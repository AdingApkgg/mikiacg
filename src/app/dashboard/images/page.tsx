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
  Images,
  Search,
  Eye,
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
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatViews } from "@/lib/format";

type ImageStatus = "PENDING" | "PUBLISHED" | "REJECTED";
type StatusFilter = "ALL" | ImageStatus;

type ImageRegexField = "title" | "description" | "images";

interface RegexTemplate {
  name: string;
  description: string;
  field: ImageRegexField;
  pattern: string;
  replacement: string;
  flags: string;
}

const REGEX_TEMPLATES: RegexTemplate[] = [
  {
    name: "图片链接 HTTP→HTTPS",
    description: "将图片 URL 中的 http:// 替换为 https://",
    field: "images",
    pattern: "^http://",
    replacement: "https://",
    flags: "",
  },
  {
    name: "替换图片 CDN 域名",
    description: "替换图片链接中的 CDN 域名（请修改域名）",
    field: "images",
    pattern: "https://old-cdn\\.example\\.com",
    replacement: "https://cdn.example.com",
    flags: "g",
  },
  {
    name: "去除图片链接查询参数",
    description: "移除图片链接中 ? 后的所有查询参数",
    field: "images",
    pattern: "\\?.*$",
    replacement: "",
    flags: "",
  },
  {
    name: "图片 URL 补全协议",
    description: "为以 // 开头的图片 URL 补全 https: 协议",
    field: "images",
    pattern: "^\\/\\/",
    replacement: "https://",
    flags: "",
  },
  {
    name: "去除标题方括号标记",
    description: "去除标题中的 [写真]、[合集] 等方括号标记",
    field: "title",
    pattern: "\\s*\\[.*?\\]\\s*",
    replacement: " ",
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
  {
    name: "清空描述中 HTML 标签",
    description: "移除描述中所有 HTML 标签，只保留文本内容",
    field: "description",
    pattern: "<[^>]*>",
    replacement: "",
    flags: "g",
  },
];

function getImageProxyUrl(url: string, thumb?: { w: number; q?: number }): string {
  const base = `/api/cover/${encodeURIComponent(url)}`;
  if (!thumb) return url.startsWith("/uploads/") ? url : base;
  return `${base}?w=${thumb.w}&h=${thumb.w}&q=${thumb.q ?? 60}`;
}

interface ImageItem {
  id: string;
  title: string;
  description: string | null;
  images: string[];
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
}

export default function DashboardImagesPage() {
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
  const [exporting, setExporting] = useState(false);

  const [regexOpen, setRegexOpen] = useState(false);
  const [regexField, setRegexField] = useState<ImageRegexField>("images");
  const [regexPattern, setRegexPattern] = useState("");
  const [regexReplacement, setRegexReplacement] = useState("");
  const [regexFlags, setRegexFlags] = useState("g");
  const [regexPreviewing, setRegexPreviewing] = useState(false);
  const [regexPreviews, setRegexPreviews] = useState<{ id: string; title: string; before: string; after: string }[]>([]);
  const [regexPreviewStats, setRegexPreviewStats] = useState<{ totalMatched: number; totalSelected: number } | null>(null);

  const limit = 50;
  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getImageStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("video:moderate"),
  });

  const { data, isLoading, isFetching } = trpc.admin.listAllImages.useQuery(
    { page, limit, search: search || undefined, status: statusFilter },
    { enabled: permissions?.scopes.includes("video:moderate") }
  );

  const moderateMutation = trpc.admin.moderateImage.useMutation({
    onSuccess: (_: { success: boolean }, variables: { imageId: string; status: "PUBLISHED" | "REJECTED" }) => {
      toast.success(variables.status === "PUBLISHED" ? "图片已通过审核" : "图片已拒绝");
      utils.admin.listAllImages.invalidate();
      utils.admin.getImageStats.invalidate();
    },
    onError: (error: { message: string }) => toast.error(error.message || "操作失败"),
  });

  const deleteMutation = trpc.admin.deleteImage.useMutation({
    onSuccess: () => {
      toast.success("图片已删除");
      utils.admin.listAllImages.invalidate();
      utils.admin.getImageStats.invalidate();
      setDeletingId(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "删除失败"),
  });

  const batchModerateMutation = trpc.admin.batchModerateImages.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已处理 ${result.count} 个图片帖`);
      utils.admin.listAllImages.invalidate();
      utils.admin.getImageStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量操作失败"),
  });

  const batchDeleteMutation = trpc.admin.batchDeleteImages.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已删除 ${result.count} 个图片帖`);
      utils.admin.listAllImages.invalidate();
      utils.admin.getImageStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量删除失败"),
  });

  const batchRegexUpdateMutation = trpc.admin.batchImageRegexUpdate.useMutation({
    onSuccess: (result: { success: boolean; count: number }) => {
      toast.success(`已更新 ${result.count} 个图片帖`);
      utils.admin.listAllImages.invalidate();
      setRegexOpen(false);
      setRegexPreviews([]);
      setRegexPreviewStats(null);
      setRegexPattern("");
      setRegexReplacement("");
    },
    onError: (error: { message: string }) => toast.error(error.message || "批量编辑失败"),
  });

  const images = useMemo(
    () => (data?.images || []) as unknown as ImageItem[],
    [data?.images]
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
    const pageIds = new Set(images.map((i) => i.id));
    const allPageSelected = images.every((i) => selectedIds.has(i.id));

    if (allPageSelected) {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.delete(id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      pageIds.forEach((id) => newSet.add(id));
      setSelectedIds(newSet);
    }
  }, [images, selectedIds]);

  const selectAll = async () => {
    setSelectAllLoading(true);
    try {
      const result = await utils.admin.getAllImageIds.fetch({
        status: statusFilter,
        search: search || undefined,
      });
      setSelectedIds(new Set(result));
      toast.success(`已选择全部 ${result.length} 个图片帖`);
    } catch {
      toast.error("获取图片列表失败");
    } finally {
      setSelectAllLoading(false);
    }
  };

  const deselectAll = () => setSelectedIds(new Set());

  const handleExport = async () => {
    if (selectedIds.size === 0) return;
    setExporting(true);
    try {
      const data = await utils.client.admin.exportImages.query({
        imageIds: Array.from(selectedIds),
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `images_export_${data.length}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`已导出 ${data.length} 个图片帖`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

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

  const getStatusBadge = (status: ImageStatus) => {
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
  const isPageAllSelected = images.length > 0 && images.every((i) => selectedIds.has(i.id));

  if (!canModerate) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有图片管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Images className="h-5 w-5" />
          <h1 className="text-xl font-semibold">图片管理</h1>
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
            placeholder="搜索图片标题或描述..."
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
            title={`选择所有 ${totalCount} 个图片帖`}
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
                    imageIds: Array.from(selectedIds),
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
                    imageIds: Array.from(selectedIds),
                    status: "REJECTED",
                  })
                }
                disabled={batchModerateMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" />
                批量拒绝
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                导出 JSON
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

      {/* 图片列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到图片帖
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {images.map((post) => {
              const isSelected = selectedIds.has(post.id);
              const isExpanded = expandedIds.has(post.id);
              const imageUrls = (post.images ?? []) as string[];
              const previewImages = imageUrls.slice(0, 4);

              return (
                <Card
                  key={post.id}
                  className={cn(
                    "transition-colors",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(post.id)}
                        className="mt-1"
                      />

                      {/* 缩略图 - 2x2 网格 */}
                      <div className="relative w-24 h-24 rounded-lg bg-muted overflow-hidden shrink-0">
                        {previewImages.length >= 4 ? (
                          <div className="grid grid-cols-2 grid-rows-2 h-full gap-px">
                            {previewImages.map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={getImageProxyUrl(url, { w: 100, q: 50 })}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ))}
                          </div>
                        ) : previewImages.length > 0 ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getImageProxyUrl(previewImages[0], { w: 200, q: 60 })}
                            alt={post.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Images className="h-6 w-6 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded">
                          {imageUrls.length} 张
                        </div>
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/image/${post.id}`}
                              className="font-medium hover:underline line-clamp-1"
                            >
                              {post.title}
                            </Link>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={post.uploader.avatar || undefined} />
                                <AvatarFallback className="text-xs">
                                  {(post.uploader.nickname || post.uploader.username).charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <Link href={`/user/${post.uploader.id}`} className="hover:underline">
                                {post.uploader.nickname || post.uploader.username}
                              </Link>
                              <span>·</span>
                              <span>{formatRelativeTime(post.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {formatViews(post.views)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Images className="h-3 w-3" />
                                {imageUrls.length} 张
                              </span>
                            </div>
                          </div>
                          {getStatusBadge(post.status as ImageStatus)}
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1 mt-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/image/${post.id}`} target="_blank">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              查看
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/image/edit/${post.id}`}>
                              <Edit2 className="h-3 w-3 mr-1" />
                              编辑
                            </Link>
                          </Button>
                          {post.status !== "PUBLISHED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600"
                              onClick={() =>
                                moderateMutation.mutate({
                                  imageId: post.id,
                                  status: "PUBLISHED",
                                })
                              }
                              disabled={moderateMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              通过
                            </Button>
                          )}
                          {post.status !== "REJECTED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600"
                              onClick={() =>
                                moderateMutation.mutate({
                                  imageId: post.id,
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
                              onClick={() => setDeletingId(post.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              删除
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-auto"
                            onClick={() => toggleExpand(post.id)}
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
                              <div className="font-medium text-foreground mb-1">图片帖 ID</div>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">{post.id}</code>
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                创建时间
                              </div>
                              {new Date(post.createdAt).toLocaleString("zh-CN")}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">图片数量</div>
                              {imageUrls.length} 张
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">浏览量</div>
                              {formatViews(post.views)}
                            </div>
                          </div>

                          {post.description && (
                            <div>
                              <div className="font-medium text-foreground mb-1">描述</div>
                              <p className="text-sm whitespace-pre-wrap line-clamp-5">{post.description}</p>
                            </div>
                          )}

                          {post.tags && post.tags.length > 0 && (
                            <div>
                              <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                标签
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {post.tags.map((t) => (
                                  <Badge key={t.tag.id} variant="outline" className="text-xs">
                                    {t.tag.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 图片预览网格 */}
                          {imageUrls.length > 0 && (
                            <div>
                              <div className="font-medium text-foreground mb-1">图片预览</div>
                              <div className="grid grid-cols-6 md:grid-cols-8 gap-1">
                                {imageUrls.slice(0, 16).map((url, i) => (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="aspect-square rounded overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={getImageProxyUrl(url, { w: 150, q: 60 })}
                                      alt={`${post.title} - ${i + 1}`}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  </a>
                                ))}
                                {imageUrls.length > 16 && (
                                  <div className="aspect-square rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                    +{imageUrls.length - 16}
                                  </div>
                                )}
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
                第 {currentPage} 页，共 {totalPages} 页（{totalCount} 个图片帖）
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

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除这个图片帖吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，图片帖及其所有关联数据将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ imageId: deletingId })}
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
              将永久删除 {selectedIds.size} 个图片帖及其所有关联数据，此操作不可恢复！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ imageIds: Array.from(selectedIds) })}
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
              对已选 {selectedIds.size} 个图片帖使用正则表达式批量替换字段内容
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
                  <SelectItem value="images">图片链接 (images)</SelectItem>
                  <SelectItem value="title">标题 (title)</SelectItem>
                  <SelectItem value="description">描述 (description)</SelectItem>
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
                  placeholder="例: https://old-cdn\.com"
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
                  const result = await utils.client.admin.batchImageRegexPreview.query({
                    imageIds: Array.from(selectedIds),
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
                    {regexPreviewStats.totalMatched} / {regexPreviewStats.totalSelected} 个图片帖将被修改
                  </Badge>
                </div>

                {regexPreviews.length > 0 && (
                  <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-medium">图片帖</th>
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
                    没有图片帖匹配该正则表达式
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
                  imageIds: Array.from(selectedIds),
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
