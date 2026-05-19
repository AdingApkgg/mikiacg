"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ArrowLeft, Loader2, Send, ShieldCheck, Settings, Trash2, StickyNote, MessageSquare } from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/format";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  RESOURCE_REQUEST_TYPE_LABELS,
  REPORT_TARGET_TYPE_LABELS,
} from "@/lib/ticket-schema";
import { CategoryBadge, StatusBadge, PriorityBadge } from "@/app/feedback/_components/badges";

export default function AdminTicketDetailClient({ ticketId }: { ticketId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.admin.getTicketById.useQuery(
    { id: ticketId },
    { refetchOnWindowFocus: true },
  );
  const { data: assignees } = trpc.admin.assigneeOptions.useQuery();

  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const replyMutation = trpc.admin.replyTicket.useMutation({
    onSuccess: (_, vars) => {
      if (vars.isInternal) {
        setInternalNote("");
        toast.success("内部备注已添加");
      } else {
        setReply("");
        toast.success("回复已发送");
      }
      utils.admin.getTicketById.invalidate({ id: ticketId });
      utils.admin.listTickets.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.admin.updateTicket.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      utils.admin.getTicketById.invalidate({ id: ticketId });
      utils.admin.listTickets.invalidate();
      utils.admin.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteTicket.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      window.location.href = "/dashboard/tickets";
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-12 text-center">
        <p className="text-muted-foreground mb-4">工单不存在</p>
        <Button asChild variant="outline">
          <Link href="/dashboard/tickets">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回列表
          </Link>
        </Button>
      </div>
    );
  }

  const { ticket, userTicketCount } = data;
  const externalReplies = ticket.replies.filter((r) => !r.isInternal);
  const internalReplies = ticket.replies.filter((r) => r.isInternal);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/dashboard/tickets"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回工单列表
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <StatusBadge status={ticket.status} />
                <CategoryBadge category={ticket.category} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <h1 className="text-xl font-bold tracking-tight">{ticket.title}</h1>
              <div className="text-xs text-muted-foreground">
                提交于 {formatDate(ticket.createdAt, "YYYY-MM-DD HH:mm")} · 最后更新{" "}
                {formatRelativeTime(ticket.lastReplyAt ?? ticket.updatedAt)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.content}</div>
              <MetadataBlock category={ticket.category} metadata={ticket.metadata} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="conversation">
                <TabsList className="mb-4">
                  <TabsTrigger value="conversation" className="gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    对话 ({externalReplies.length})
                  </TabsTrigger>
                  <TabsTrigger value="internal" className="gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" />
                    内部备注 ({internalReplies.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="conversation" className="space-y-4 mt-0">
                  {externalReplies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">还没有回复</p>
                  ) : (
                    externalReplies.map((r) => (
                      <ReplyBubble key={r.id} reply={r} authorIsTicketOwner={r.userId === ticket.userId} />
                    ))
                  )}

                  {ticket.status !== "CLOSED" && (
                    <div className="pt-2 border-t">
                      <Textarea
                        placeholder="回复用户..."
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
                            replyMutation.mutate({ ticketId, content: reply.trim(), isInternal: false });
                          }}
                          disabled={replyMutation.isPending}
                        >
                          {replyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          回复用户
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="internal" className="space-y-4 mt-0">
                  <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    内部备注仅管理员可见,用户看不到这里的内容
                  </div>

                  {internalReplies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">暂无内部备注</p>
                  ) : (
                    internalReplies.map((r) => <ReplyBubble key={r.id} reply={r} isInternal />)
                  )}

                  <div className="pt-2 border-t">
                    <Textarea
                      placeholder="仅管理员可见的备注..."
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      maxLength={5000}
                      rows={3}
                      className="mb-2"
                    />
                    <div className="flex items-center justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (internalNote.trim().length < 1) {
                            toast.error("内容不能为空");
                            return;
                          }
                          replyMutation.mutate({
                            ticketId,
                            content: internalNote.trim(),
                            isInternal: true,
                          });
                        }}
                        disabled={replyMutation.isPending}
                      >
                        {replyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <StickyNote className="h-4 w-4 mr-2" />
                        )}
                        添加备注
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* 右侧管理面板 */}
        <aside className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <SidebarSection label="状态">
                <Select
                  value={ticket.status}
                  onValueChange={(v) =>
                    updateMutation.mutate({
                      ticketId,
                      status: v as (typeof TICKET_STATUSES)[number],
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TICKET_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarSection>

              <SidebarSection label="优先级">
                <Select
                  value={ticket.priority}
                  onValueChange={(v) =>
                    updateMutation.mutate({
                      ticketId,
                      priority: v as (typeof TICKET_PRIORITIES)[number],
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="h-9">
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
              </SidebarSection>

              <SidebarSection label="处理人">
                <Select
                  value={ticket.assigneeId ?? "__none__"}
                  onValueChange={(v) =>
                    updateMutation.mutate({
                      ticketId,
                      assigneeId: v === "__none__" ? null : v,
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="未分配" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未分配</SelectItem>
                    {(assignees ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nickname || a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarSection>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">快捷操作</div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => updateMutation.mutate({ ticketId, status: "RESOLVED" })}
                disabled={updateMutation.isPending || ticket.status === "RESOLVED"}
              >
                标记为已解决
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => updateMutation.mutate({ ticketId, status: "WAITING_USER" })}
                disabled={updateMutation.isPending || ticket.status === "WAITING_USER"}
              >
                等待用户补充
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => updateMutation.mutate({ ticketId, status: "CLOSED" })}
                disabled={updateMutation.isPending || ticket.status === "CLOSED"}
              >
                关闭工单
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    删除工单
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除?</AlertDialogTitle>
                    <AlertDialogDescription>删除后工单和所有回复将永久消失,不可恢复。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate({ ticketId })}
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">提交人</div>
              <div className="flex items-center gap-2">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={ticket.user.avatar ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {(ticket.user.nickname || ticket.user.username)[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{ticket.user.nickname || ticket.user.username}</div>
                  <div className="text-[11px] text-muted-foreground">@{ticket.user.username}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                累计工单:<span className="text-foreground ml-1 font-medium">{userTicketCount}</span>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/user/${ticket.user.username}`}>查看主页</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}

// ==================== 回复气泡(管理员视角) ====================

type ReplyData = {
  id: string;
  content: string;
  isStaff: boolean;
  isSystem: boolean;
  isInternal: boolean;
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

function ReplyBubble({
  reply,
  authorIsTicketOwner,
  isInternal,
}: {
  reply: ReplyData;
  authorIsTicketOwner?: boolean;
  isInternal?: boolean;
}) {
  if (reply.isSystem) {
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
  // 管理员视角:用户在左,管理员在右
  const alignRight = reply.isStaff;

  return (
    <div className={cn("flex gap-3", alignRight && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={reply.user?.avatar ?? undefined} />
        <AvatarFallback className="text-xs">{initial}</AvatarFallback>
      </Avatar>
      <div className={cn("flex flex-col gap-1 min-w-0 max-w-[80%]", alignRight && "items-end")}>
        <div className={cn("flex items-center gap-2", alignRight && "flex-row-reverse")}>
          <span className="text-xs font-medium">{name}</span>
          {reply.isStaff && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-medium">
              <ShieldCheck className="h-2.5 w-2.5" />
              管理员
            </span>
          )}
          {authorIsTicketOwner && !reply.isStaff && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">提交人</span>
          )}
          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(reply.createdAt)}</span>
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isInternal
              ? "bg-amber-500/10 border border-amber-500/20"
              : alignRight
                ? "bg-primary text-primary-foreground"
                : "bg-muted",
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
