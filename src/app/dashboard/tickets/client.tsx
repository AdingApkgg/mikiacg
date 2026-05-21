"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Inbox, Search, Filter, X, Trash2, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/format";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/ticket-schema";
import { formatDate } from "@/lib/format";
import { CategoryBadge, StatusBadge, PriorityBadge } from "@/app/feedback/_components/badges";

type StatusFilter = "ALL" | (typeof TICKET_STATUSES)[number];

const STATUS_TABS: StatusFilter[] = ["ALL", "PENDING", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];

export default function AdminTicketsClient() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [category, setCategory] = useState<"ALL" | (typeof TICKET_CATEGORIES)[number]>("ALL");
  const [priority, setPriority] = useState<"ALL" | (typeof TICKET_PRIORITIES)[number]>("ALL");
  const [search, setSearch] = useState("");

  const { data: stats } = trpc.admin.stats.useQuery();

  const queryInput = useMemo(
    () => ({
      page,
      limit: 20,
      status: status === "ALL" ? undefined : status,
      category: category === "ALL" ? undefined : category,
      priority: priority === "ALL" ? undefined : priority,
      search: search.trim() || undefined,
    }),
    [page, status, category, priority, search],
  );

  const { data, isLoading } = trpc.admin.listTickets.useQuery(queryInput);
  const { data: assignees } = trpc.admin.assigneeOptions.useQuery();
  const utils = trpc.useUtils();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pageTicketIds = useMemo(() => data?.tickets.map((t) => t.id) ?? [], [data]);
  const allSelected = pageTicketIds.length > 0 && pageTicketIds.every((id) => selected.has(id));
  const someSelected = pageTicketIds.some((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set([...selected].filter((id) => !pageTicketIds.includes(id))));
    } else {
      setSelected(new Set([...selected, ...pageTicketIds]));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const batchMutation = trpc.admin.batchUpdate.useMutation({
    onSuccess: ({ affected }) => {
      toast.success(`已处理 ${affected} 条工单`);
      setSelected(new Set());
      utils.admin.listTickets.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  // 导出 CSV
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await utils.admin.exportTickets.fetch({
        status: status === "ALL" ? undefined : status,
        category: category === "ALL" ? undefined : category,
        priority: priority === "ALL" ? undefined : priority,
        search: search.trim() || undefined,
      });
      if (rows.length === 0) {
        toast.info("当前筛选下没有可导出的工单");
        return;
      }
      const csv = ticketsToCsv(rows);
      downloadCsv(csv, `tickets-${formatDate(new Date(), "YYYYMMDD-HHmmss")}.csv`);
      toast.success(`已导出 ${rows.length} 条工单`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          <h1 className="text-xl font-bold">工单管理</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {stats && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Pill label="待处理" value={stats.counts.PENDING} color="amber" />
              <Pill label="处理中" value={stats.counts.IN_PROGRESS} color="blue" />
              <Pill label="今日新增" value={stats.todayCount} color="violet" />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1.5" />
            )}
            导出 CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标题 / 内容 / 用户"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {STATUS_TABS.map((s) => {
              const active = status === s;
              const label = s === "ALL" ? "全部" : TICKET_STATUS_LABELS[s];
              const count = s === "ALL" ? (stats?.total ?? 0) : (stats?.counts[s] ?? 0);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s);
                    setPage(1);
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors whitespace-nowrap",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                  {count > 0 && <span className="ml-1 opacity-80">{count}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as typeof category);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有分类</SelectItem>
                {TICKET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TICKET_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priority}
              onValueChange={(v) => {
                setPriority(v as typeof priority);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有优先级</SelectItem>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TICKET_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作工具栏 */}
      {selected.size > 0 && (
        <BatchActionBar
          count={selected.size}
          assignees={assignees ?? []}
          isPending={batchMutation.isPending}
          onClear={() => setSelected(new Set())}
          onAction={(action) => batchMutation.mutate({ ticketIds: selectedIds, action })}
        />
      )}

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !data || data.tickets.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">没有匹配的工单</div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 text-xs text-muted-foreground">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="全选"
                />
                <span>
                  {selected.size > 0
                    ? `已选 ${selected.size} 条`
                    : `本页 ${data.tickets.length} 条 / 共 ${data.totalCount} 条`}
                </span>
              </div>
              <ul className="divide-y">
                {data.tickets.map((t) => {
                  const isChecked = selected.has(t.id);
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors",
                        isChecked && "bg-accent/40",
                      )}
                    >
                      <Checkbox checked={isChecked} onCheckedChange={() => toggleOne(t.id)} aria-label="选择工单" />
                      <Link href={`/dashboard/tickets/${t.id}`} className="flex-1 flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <StatusBadge status={t.status} />
                            <CategoryBadge category={t.category} />
                            {t.priority !== "NORMAL" && <PriorityBadge priority={t.priority} />}
                          </div>
                          <h3 className="font-medium text-sm line-clamp-1">{t.title}</h3>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{t.user.nickname || t.user.username}</span>
                            <span>·</span>
                            <span>{t._count.replies} 条回复</span>
                            {t.assignee && (
                              <>
                                <span>·</span>
                                <span>已分配 {t.assignee.nickname || t.assignee.username}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 text-right">
                          {formatRelativeTime(t.lastReplyAt ?? t.createdAt)}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}

// ==================== 批量操作工具栏 ====================

type BatchAction =
  | { type: "status"; value: (typeof TICKET_STATUSES)[number] }
  | { type: "priority"; value: (typeof TICKET_PRIORITIES)[number] }
  | { type: "assignee"; value: string | null }
  | { type: "delete" };

function BatchActionBar({
  count,
  assignees,
  isPending,
  onClear,
  onAction,
}: {
  count: number;
  assignees: { id: string; username: string; nickname: string | null }[];
  isPending: boolean;
  onClear: () => void;
  onAction: (action: BatchAction) => void;
}) {
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium">已选 {count} 条</span>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        {/* 改状态 */}
        <Select
          disabled={isPending}
          onValueChange={(v) => onAction({ type: "status", value: v as (typeof TICKET_STATUSES)[number] })}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="改状态" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 改优先级 */}
        <Select
          disabled={isPending}
          onValueChange={(v) => onAction({ type: "priority", value: v as (typeof TICKET_PRIORITIES)[number] })}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="改优先级" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TICKET_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 分配 */}
        <Select
          disabled={isPending}
          onValueChange={(v) => onAction({ type: "assignee", value: v === "__none__" ? null : v })}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="分配给" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">取消分配</SelectItem>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nickname || a.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 删除 */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-destructive hover:text-destructive"
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除 {count} 条工单?</AlertDialogTitle>
              <AlertDialogDescription>删除后这些工单和所有回复将永久消失,不可恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => onAction({ type: "delete" })}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="ml-auto">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClear}>
            <X className="h-3.5 w-3.5 mr-1" />
            取消选择
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== CSV 工具 ====================

type TicketExportRow = {
  id: string;
  category: keyof typeof TICKET_CATEGORY_LABELS;
  status: keyof typeof TICKET_STATUS_LABELS;
  priority: keyof typeof TICKET_PRIORITY_LABELS;
  title: string;
  createdAt: Date | string;
  lastReplyAt: Date | string | null;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
  duplicateOfId: string | null;
  user: { username: string; nickname: string | null };
  assignee: { username: string; nickname: string | null } | null;
  _count: { replies: number };
};

function escapeCsvField(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function ticketsToCsv(rows: TicketExportRow[]): string {
  const headers = [
    "ID",
    "分类",
    "状态",
    "优先级",
    "标题",
    "提交人",
    "处理人",
    "回复数",
    "提交时间",
    "最后回复",
    "解决时间",
    "关闭时间",
    "重复合并到",
  ];
  const lines: string[] = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        TICKET_CATEGORY_LABELS[r.category] ?? r.category,
        TICKET_STATUS_LABELS[r.status] ?? r.status,
        TICKET_PRIORITY_LABELS[r.priority] ?? r.priority,
        r.title,
        r.user.nickname || r.user.username,
        r.assignee ? r.assignee.nickname || r.assignee.username : "",
        r._count.replies,
        formatDate(r.createdAt, "YYYY-MM-DD HH:mm:ss"),
        r.lastReplyAt ? formatDate(r.lastReplyAt, "YYYY-MM-DD HH:mm:ss") : "",
        r.resolvedAt ? formatDate(r.resolvedAt, "YYYY-MM-DD HH:mm:ss") : "",
        r.closedAt ? formatDate(r.closedAt, "YYYY-MM-DD HH:mm:ss") : "",
        r.duplicateOfId ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    );
  }
  // BOM for Excel UTF-8 compatibility
  return "﻿" + lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Pill({ label, value, color }: { label: string; value: number; color: "amber" | "blue" | "violet" }) {
  const styles: Record<typeof color, string> = {
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5", styles[color])}>
      {label}
      <span className="font-semibold">{value}</span>
    </span>
  );
}
