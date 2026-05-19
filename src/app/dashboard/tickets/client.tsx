"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox, Search, Filter } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/ticket-schema";
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

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          <h1 className="text-xl font-bold">工单管理</h1>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Pill label="待处理" value={stats.counts.PENDING} color="amber" />
            <Pill label="处理中" value={stats.counts.IN_PROGRESS} color="blue" />
            <Pill label="今日新增" value={stats.todayCount} color="violet" />
          </div>
        )}
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
            <ul className="divide-y">
              {data.tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/dashboard/tickets/${t.id}`}
                    className="flex items-center gap-3 p-4 hover:bg-accent/30 transition-colors"
                  >
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
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} />
      )}
    </div>
  );
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
