"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStableSession } from "@/lib/hooks";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { ArrowLeft, Loader2, Send, ShieldCheck, Settings, X } from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { RESOURCE_REQUEST_TYPE_LABELS, REPORT_TARGET_TYPE_LABELS } from "@/lib/ticket-schema";
import { CategoryBadge, StatusBadge, PriorityBadge } from "../_components/badges";

export default function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const { session, isLoading: sessionLoading } = useStableSession();
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !session?.user) {
      router.replace(`/login?callbackUrl=/feedback/${ticketId}`);
    }
  }, [sessionLoading, session, router, ticketId]);

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: !!session?.user, refetchOnWindowFocus: true },
  );

  const [reply, setReply] = useState("");

  const replyMutation = trpc.ticket.reply.useMutation({
    onSuccess: () => {
      setReply("");
      toast.success("已发送");
      utils.ticket.getById.invalidate({ id: ticketId });
      utils.ticket.list.invalidate();
      utils.ticket.myStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const closeMutation = trpc.ticket.close.useMutation({
    onSuccess: () => {
      toast.success("工单已关闭");
      utils.ticket.getById.invalidate({ id: ticketId });
      utils.ticket.list.invalidate();
      utils.ticket.myStats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (sessionLoading || !session?.user) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">工单不存在或已被删除</p>
        <Button asChild variant="outline">
          <Link href="/feedback">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回反馈列表
          </Link>
        </Button>
      </div>
    );
  }

  const ticket = data;
  const isClosed = ticket.status === "CLOSED";
  const isResolved = ticket.status === "RESOLVED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-8 space-y-4">
      <Link
        href="/feedback"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回反馈列表
      </Link>

      {/* 头部信息 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <StatusBadge status={ticket.status} />
            <CategoryBadge category={ticket.category} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{ticket.title}</h1>
          <p className="text-xs text-muted-foreground">
            提交于 {formatDate(ticket.createdAt, "YYYY-MM-DD HH:mm")} · 最后更新{" "}
            {formatRelativeTime(ticket.lastReplyAt ?? ticket.updatedAt)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.content}</div>
          <MetadataBlock category={ticket.category} metadata={ticket.metadata} />
        </CardContent>
      </Card>

      {/* 对话流 */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-sm font-medium">对话记录</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.replies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">还没有回复,请耐心等待管理员处理</p>
          ) : (
            ticket.replies.map((r) => (
              <ReplyBubble
                key={r.id}
                reply={r}
                isSelf={r.userId === session.user.id && !r.isStaff}
                isSystem={r.isSystem}
              />
            ))
          )}

          {!isClosed && (
            <div className="pt-2 border-t">
              <Textarea
                placeholder="输入回复..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={5000}
                rows={3}
                className="mb-2"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">{reply.length} / 5000</span>
                <Button
                  size="sm"
                  onClick={() => {
                    if (reply.trim().length < 1) {
                      toast.error("内容不能为空");
                      return;
                    }
                    replyMutation.mutate({ ticketId, content: reply.trim() });
                  }}
                  disabled={replyMutation.isPending || reply.trim().length === 0}
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  发送
                </Button>
              </div>
            </div>
          )}

          {isClosed && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground text-center">
              工单已关闭,无法继续回复
            </div>
          )}
        </CardContent>
      </Card>

      {!isClosed && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={closeMutation.isPending}>
                <X className="h-4 w-4 mr-2" />
                {isResolved ? "关闭工单" : "问题已解决,关闭工单"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认关闭工单?</AlertDialogTitle>
                <AlertDialogDescription>关闭后将无法继续回复。如有新问题请重新提交反馈。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => closeMutation.mutate({ ticketId })}>确认关闭</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ==================== 回复气泡 ====================

type ReplyData = {
  id: string;
  content: string;
  isStaff: boolean;
  isSystem: boolean;
  createdAt: Date;
  userId: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
    role: string;
  } | null;
};

function ReplyBubble({ reply, isSelf, isSystem }: { reply: ReplyData; isSelf: boolean; isSystem: boolean }) {
  if (isSystem) {
    return (
      <div className="flex items-center justify-center gap-2 py-1">
        <Settings className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{reply.content}</span>
        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(reply.createdAt)}</span>
      </div>
    );
  }

  const name = reply.user?.nickname || reply.user?.username || "用户";
  const initial = (name[0] || "U").toUpperCase();

  return (
    <div className={cn("flex gap-3", isSelf && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={reply.user?.avatar ?? undefined} />
        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
      </Avatar>
      <div className={cn("flex flex-col gap-1 min-w-0 max-w-[80%]", isSelf && "items-end")}>
        <div className={cn("flex items-center gap-2", isSelf && "flex-row-reverse")}>
          <span className="text-xs font-medium">{isSelf ? "我" : name}</span>
          {reply.isStaff && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-medium">
              <ShieldCheck className="h-2.5 w-2.5" />
              管理员
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(reply.createdAt)}</span>
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isSelf ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {reply.content}
        </div>
      </div>
    </div>
  );
}

// ==================== Metadata 展示 ====================

function MetadataBlock({ category, metadata }: { category: string; metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;

  const items: { label: string; value: string }[] = [];

  if (category === "BUG") {
    if (m.page) items.push({ label: "出现页面", value: String(m.page) });
    if (m.browser) items.push({ label: "浏览器", value: String(m.browser) });
    if (m.device) items.push({ label: "设备", value: String(m.device) });
  } else if (category === "RESOURCE_REQUEST") {
    if (m.resourceType) {
      const key = m.resourceType as keyof typeof RESOURCE_REQUEST_TYPE_LABELS;
      items.push({ label: "类型", value: RESOURCE_REQUEST_TYPE_LABELS[key] ?? String(m.resourceType) });
    }
    if (m.name) items.push({ label: "名称", value: String(m.name) });
    if (m.year) items.push({ label: "年份", value: String(m.year) });
    if (m.link) items.push({ label: "参考链接", value: String(m.link) });
  } else if (category === "CONTENT_REPORT") {
    if (m.targetType) {
      const key = m.targetType as keyof typeof REPORT_TARGET_TYPE_LABELS;
      items.push({ label: "对象", value: REPORT_TARGET_TYPE_LABELS[key] ?? String(m.targetType) });
    }
    if (m.targetId) items.push({ label: "目标 ID", value: String(m.targetId) });
    if (m.reason) items.push({ label: "举报原因", value: String(m.reason) });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-md bg-muted/40 p-3 space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex gap-2 text-xs">
          <span className="text-muted-foreground shrink-0 w-20">{it.label}</span>
          <span className="text-foreground break-all">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
