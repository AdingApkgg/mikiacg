"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Laptop,
  Smartphone,
  Tablet,
  Trash2,
  MapPin,
  Clock,
  LogOut,
  Shield,
  Globe,
  Monitor,
} from "lucide-react";
import { formatRelativeTime, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast-with-sound";
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

function DeviceIcon({ type, className }: { type?: string | null; className?: string }) {
  if (type === "mobile") return <Smartphone className={className} />;
  if (type === "tablet") return <Tablet className={className} />;
  return <Laptop className={className} />;
}

function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 4) return `${parts.slice(0, 4).join(":")}:****`;
    return ip;
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  return ip;
}

export default function SessionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [hasRecorded, setHasRecorded] = useState(false);

  const utils = trpc.useUtils();

  const { data: sessionsData, isLoading } = trpc.user.getLoginSessions.useQuery(
    { limit: 20 },
    { enabled: !!session?.user?.id }
  );

  const revokeMut = trpc.user.revokeLoginSession.useMutation({
    onSuccess: () => {
      utils.user.getLoginSessions.invalidate();
      toast.success("会话已撤销，该设备将被登出");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeAllMut = trpc.user.revokeAllOtherSessions.useMutation({
    onSuccess: (data) => {
      utils.user.getLoginSessions.invalidate();
      toast.success(`已撤销 ${data.count} 个会话`);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (session?.user && !hasRecorded) {
      fetch("/api/auth/session-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then(() => {
        setHasRecorded(true);
        utils.user.getLoginSessions.invalidate();
      }).catch(console.error);
    }
  }, [session?.user, hasRecorded, utils.user.getLoginSessions]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings/sessions");
    }
  }, [status, router]);

  if (status === "loading" || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  if (!session) return null;

  const sessions = sessionsData?.sessions || [];
  const currentJti = sessionsData?.currentJti;
  const currentSession = sessions.find(s => s.jti === currentJti);
  const otherSessions = sessions.filter(s => s.jti !== currentJti);

  return (
    <div className="space-y-8">
      {/* 标题 */}
      <div>
        <h2 className="text-xl font-semibold">活动会话</h2>
        <p className="text-sm text-muted-foreground mt-1">
          查看与你账号关联的所有活动会话。如果发现可疑活动，可以撤销对应的会话。
        </p>
      </div>

      {/* 当前会话 */}
      {currentSession && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">当前会话</h3>
          <SessionCard session={currentSession} isCurrent />
        </div>
      )}

      {/* 其他会话 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            其他会话{otherSessions.length > 0 && ` (${otherSessions.length})`}
          </h3>
          {otherSessions.length > 1 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 text-xs">
                  <LogOut className="h-3.5 w-3.5 mr-1" />
                  撤销所有其他会话
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>撤销所有其他会话？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将撤销除当前设备外的 {otherSessions.length} 个会话。这些设备将被立即登出，需要重新登录。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => revokeAllMut.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    撤销全部
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {otherSessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground border rounded-lg bg-muted/30">
            <Monitor className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            没有其他活动会话
          </div>
        ) : (
          <div className="space-y-2">
            {otherSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onRevoke={() => revokeMut.mutate({ id: s.id })}
                isRevoking={revokeMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* 安全信息 */}
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
        <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>会话在 30 天无活动后自动过期。撤销会话将立即使对应设备的登录失效。</p>
          <p>如果发现不认识的会话，建议撤销后修改密码。</p>
        </div>
      </div>
    </div>
  );
}

type SessionData = {
  id: string;
  jti: string;
  deviceType?: string | null;
  os?: string | null;
  osVersion?: string | null;
  browser?: string | null;
  browserVersion?: string | null;
  brand?: string | null;
  model?: string | null;
  ipv4Address?: string | null;
  ipv4Location?: string | null;
  ipv6Address?: string | null;
  ipv6Location?: string | null;
  createdAt: Date | string;
  lastActiveAt: Date | string;
};

function SessionCard({
  session: s,
  isCurrent,
  onRevoke,
  isRevoking,
}: {
  session: SessionData;
  isCurrent?: boolean;
  onRevoke?: () => void;
  isRevoking?: boolean;
}) {
  const location = s.ipv4Location || s.ipv6Location;
  const ip = maskIp(s.ipv4Address) || maskIp(s.ipv6Address);
  const deviceName = [s.brand, s.model].filter(Boolean).join(" ") || s.deviceType || "未知设备";
  const osInfo = [s.os, s.osVersion].filter(Boolean).join(" ");
  const browserInfo = [s.browser, s.browserVersion].filter(Boolean).join(" ");

  // 5 分钟内活跃 → "正在查看"
  const lastActive = new Date(s.lastActiveAt);
  const isOnline = isCurrent || (Date.now() - lastActive.getTime() < 5 * 60 * 1000);

  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${isCurrent ? "border-primary/30 bg-primary/5" : "hover:bg-muted/50"}`}>
      {/* 设备图标 */}
      <div className={`p-2.5 rounded-lg shrink-0 ${isCurrent ? "bg-primary/10" : "bg-muted"}`}>
        <DeviceIcon type={s.deviceType} className={`h-5 w-5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
      </div>

      {/* 信息区 */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 第一行：设备名 + 状态 */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{deviceName}</span>
          {isCurrent && (
            <Badge className="text-[10px] h-5 px-1.5 bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">
              当前会话
            </Badge>
          )}
          {isOnline && (
            <span className="flex items-center gap-1 text-[10px] text-green-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              在线
            </span>
          )}
        </div>

        {/* 第二行：OS · 浏览器 */}
        <p className="text-sm text-muted-foreground">
          {[osInfo, browserInfo].filter(Boolean).join(" · ") || "未知环境"}
        </p>

        {/* 第三行：详细元信息 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ip && (
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {ip}
            </span>
          )}
          {location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
          <span className="inline-flex items-center gap-1" title={`登录时间: ${formatDate(s.createdAt, "YYYY-MM-DD HH:mm")}`}>
            <Clock className="h-3 w-3" />
            {isCurrent ? "当前活跃" : formatRelativeTime(s.lastActiveAt)}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      {!isCurrent && onRevoke && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              disabled={isRevoking}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>撤销此会话？</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium text-foreground">{deviceName}</span>
                {location && <span> ({location})</span>} 将被立即登出。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRevoke}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                撤销
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
