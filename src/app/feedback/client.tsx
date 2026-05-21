"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStableSession } from "@/lib/hooks";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  Bug,
  Library,
  Lightbulb,
  ShieldAlert,
  UserCog,
  HelpCircle,
  Search,
  MessageSquare,
  Send,
  Inbox,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  RESOURCE_REQUEST_TYPES,
  RESOURCE_REQUEST_TYPE_LABELS,
  REPORT_TARGET_TYPES,
  REPORT_TARGET_TYPE_LABELS,
  type TicketCategoryKey,
  type TicketAttachment,
} from "@/lib/ticket-schema";
import { CategoryBadge, StatusBadge, PriorityBadge } from "./_components/badges";
import { AttachmentUploader } from "./_components/attachment-uploader";

type StatusFilter = "ALL" | (typeof TICKET_STATUSES)[number];

const CATEGORY_ICONS: Record<TicketCategoryKey, LucideIcon> = {
  BUG: Bug,
  RESOURCE_REQUEST: Library,
  FEATURE_REQUEST: Lightbulb,
  CONTENT_REPORT: ShieldAlert,
  ACCOUNT_ISSUE: UserCog,
  OTHER: HelpCircle,
};

const STATUS_TAB_ORDER: StatusFilter[] = ["ALL", "PENDING", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];

export default function FeedbackClient() {
  const { session, isLoading: sessionLoading } = useStableSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.replace("/login?callbackUrl=/feedback");
    }
  }, [sessionLoading, session, router]);

  if (sessionLoading || !session?.user) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">反馈与求助</h1>
        <p className="text-sm text-muted-foreground mt-1">提交 BUG、求资源或意见建议，我们会尽快处理</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="order-2 lg:order-1">
          <SubmitCard />
        </div>
        <div className="order-1 lg:order-2 min-w-0">
          <MyTicketsCard />
        </div>
      </div>
    </div>
  );
}

// ==================== 提交表单 ====================

function SubmitCard() {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<TicketCategoryKey>("BUG");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<(typeof TICKET_PRIORITIES)[number]>("NORMAL");
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);

  const createMutation = trpc.ticket.create.useMutation({
    onSuccess: ({ id }) => {
      toast.success("提交成功");
      setTitle("");
      setContent("");
      setMeta({});
      setAttachments([]);
      setPriority("NORMAL");
      utils.ticket.list.invalidate();
      utils.ticket.myStats.invalidate();
      // 跳转到详情
      window.location.href = `/feedback/${id}`;
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (title.trim().length < 2) {
      toast.error("请填写标题");
      return;
    }
    if (content.trim().length < 5) {
      toast.error("请补充更详细的描述");
      return;
    }

    let metadata: Record<string, unknown> | undefined;
    if (category === "BUG") {
      metadata = {
        page: meta.page?.trim() || (typeof window !== "undefined" ? window.location.href : undefined),
        browser: meta.browser?.trim() || (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
        device: meta.device?.trim() || undefined,
      };
    } else if (category === "RESOURCE_REQUEST") {
      if (!meta.resourceType || !meta.name?.trim()) {
        toast.error("请选择类型并填写资源名称");
        return;
      }
      metadata = {
        resourceType: meta.resourceType,
        name: meta.name.trim(),
        year: meta.year?.trim() || undefined,
        link: meta.link?.trim() || undefined,
      };
    } else if (category === "CONTENT_REPORT") {
      if (!meta.targetType || !meta.reason?.trim()) {
        toast.error("请选择举报对象并填写原因");
        return;
      }
      metadata = {
        targetType: meta.targetType,
        targetId: meta.targetId?.trim() || undefined,
        reason: meta.reason.trim(),
      };
    }

    createMutation.mutate({
      category,
      title: title.trim(),
      content: content.trim(),
      priority,
      metadata,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          提交反馈
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">反馈类型</label>
          <div className="grid grid-cols-3 gap-2">
            {TICKET_CATEGORIES.map((c) => {
              const Icon = CATEGORY_ICONS[c];
              const active = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    setMeta({});
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-accent/50",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "text-primary")} />
                  <span>{TICKET_CATEGORY_LABELS[c]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">标题</label>
          <Input
            placeholder={categoryTitlePlaceholder(category)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>

        <DynamicFields category={category} meta={meta} setMeta={setMeta} />

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">详细描述</label>
          <Textarea
            placeholder="请尽量详细描述,包括复现步骤、期望结果等"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={5000}
            rows={5}
          />
          <div className="text-[11px] text-muted-foreground mt-1 text-right">{content.length} / 5000</div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">附件 (可选)</label>
          <AttachmentUploader attachments={attachments} onChange={setAttachments} />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">优先级</label>
          <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {TICKET_PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          提交反馈
        </Button>
      </CardContent>
    </Card>
  );
}

function categoryTitlePlaceholder(category: TicketCategoryKey) {
  switch (category) {
    case "BUG":
      return "例如:视频页加载白屏";
    case "RESOURCE_REQUEST":
      return "例如:求《xxx》第二季";
    case "FEATURE_REQUEST":
      return "例如:希望增加夜间模式";
    case "CONTENT_REPORT":
      return "例如:某视频内容侵权";
    case "ACCOUNT_ISSUE":
      return "例如:无法登录,提示验证码错误";
    default:
      return "简短描述你的反馈";
  }
}

function DynamicFields({
  category,
  meta,
  setMeta,
}: {
  category: TicketCategoryKey;
  meta: Record<string, string>;
  setMeta: (v: Record<string, string>) => void;
}) {
  const update = (k: string, v: string) => setMeta({ ...meta, [k]: v });

  if (category === "BUG") {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">出现页面 (可选)</label>
          <Input
            placeholder="例如 /watch/xxx"
            value={meta.page ?? ""}
            onChange={(e) => update("page", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">浏览器 / 设备 (可选)</label>
          <Input
            placeholder="例如 Chrome 130 / iPhone 15"
            value={meta.device ?? ""}
            onChange={(e) => update("device", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (category === "RESOURCE_REQUEST") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">类型</label>
            <Select value={meta.resourceType ?? ""} onValueChange={(v) => update("resourceType", v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择" />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_REQUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {RESOURCE_REQUEST_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">年份 (可选)</label>
            <Input placeholder="2024" value={meta.year ?? ""} onChange={(e) => update("year", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">资源名称</label>
          <Input
            placeholder="原名 / 中文名 / 别名"
            value={meta.name ?? ""}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">参考链接 (可选)</label>
          <Input
            placeholder="百科 / 介绍页 / 资源页"
            value={meta.link ?? ""}
            onChange={(e) => update("link", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (category === "CONTENT_REPORT") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">举报对象</label>
            <Select value={meta.targetType ?? ""} onValueChange={(v) => update("targetType", v)}>
              <SelectTrigger>
                <SelectValue placeholder="选择" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TARGET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {REPORT_TARGET_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">目标 ID (可选)</label>
            <Input
              placeholder="例如视频 ID"
              value={meta.targetId ?? ""}
              onChange={(e) => update("targetId", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">举报原因</label>
          <Input
            placeholder="一句话说明问题"
            value={meta.reason ?? ""}
            onChange={(e) => update("reason", e.target.value)}
          />
        </div>
      </div>
    );
  }

  return null;
}

// ==================== 我的工单列表 ====================

function MyTicketsCard() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const { data: stats } = trpc.ticket.myStats.useQuery();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = trpc.ticket.list.useInfiniteQuery(
    {
      limit: 20,
      status: status === "ALL" ? undefined : status,
      search: search.trim() || undefined,
    },
    { getNextPageParam: (last) => last.nextCursor },
  );

  const tickets = useMemo(() => data?.pages.flatMap((p) => p.tickets) ?? [], [data]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4" />
            我的工单
          </CardTitle>
          {stats && stats.total > 0 && <span className="text-xs text-muted-foreground">共 {stats.total} 条</span>}
        </div>

        <div className="mt-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索我的工单"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {STATUS_TAB_ORDER.map((s) => {
              const active = status === s;
              const label = s === "ALL" ? "全部" : TICKET_STATUS_LABELS[s];
              const count = s === "ALL" ? (stats?.total ?? 0) : (stats?.counts[s] ?? 0);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
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
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={search ? "没有匹配的工单" : "还没有工单"}
            description={search ? "试试其他关键词" : "在左侧提交你的第一条反馈"}
          />
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <TicketListItem key={t.id} ticket={t} />
            ))}
            {hasNextPage && (
              <div className="pt-2 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "加载更多"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TicketListItemProps = {
  ticket: {
    id: string;
    title: string;
    content: string;
    status: keyof typeof TICKET_STATUS_LABELS;
    category: TicketCategoryKey;
    priority: keyof typeof TICKET_PRIORITY_LABELS;
    createdAt: Date;
    lastReplyAt: Date | null;
    _count: { replies: number };
  };
};

function TicketListItem({ ticket }: TicketListItemProps) {
  return (
    <Link
      href={`/feedback/${ticket.id}`}
      className="block rounded-lg border bg-card hover:bg-accent/30 transition-colors p-4"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <StatusBadge status={ticket.status} />
        <CategoryBadge category={ticket.category} />
        {ticket.priority !== "NORMAL" && <PriorityBadge priority={ticket.priority} />}
      </div>
      <h3 className="font-medium text-sm leading-tight mb-1 line-clamp-1">{ticket.title}</h3>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{ticket.content}</p>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> {ticket._count.replies}
        </span>
        <span>{formatRelativeTime(ticket.lastReplyAt ?? ticket.createdAt)}</span>
      </div>
    </Link>
  );
}
