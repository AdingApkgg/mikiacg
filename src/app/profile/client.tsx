"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { useSiteConfig } from "@/contexts/site-config";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatViews } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp, MotionPage } from "@/components/motion";
import {
  Settings,
  Share2,
  MapPin,
  Globe,
  Calendar,
  Crown,
  Shield,
  Users,
  Heart,
  Star,
  ThumbsUp,
  Upload,
  Clock,
  Video,
  Images,
  Layers,
  Bell,
  Mail,
  MessageSquare,
  ChevronRight,
  Play,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// ==================== 类型 ====================

interface DashboardProps {
  userId: string;
}

// ==================== Hero 卡片 ====================

function HeroCard({ userId }: { userId: string }) {
  const { data: session } = useSession();
  const siteConfig = useSiteConfig();
  const { data: me } = trpc.user.me.useQuery();
  const { data: profile } = trpc.user.getProfile.useQuery({ id: userId });

  const user = me ?? null;
  const displayName = user?.nickname || user?.username || session?.user?.name || "";
  const username = user?.username || session?.user?.name || "";
  const avatar = user?.avatar || session?.user?.image || undefined;

  const roleLabel =
    user?.role === "OWNER" ? "站长" : user?.role === "ADMIN" ? "管理员" : user?.role === "USER" ? null : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5">
      {/* 装饰背景 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 20%, oklch(0.85 0.15 350 / 0.3), transparent 45%), radial-gradient(circle at 85% 80%, oklch(0.85 0.12 220 / 0.25), transparent 50%)",
        }}
      />

      <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          {user ? (
            <Avatar className="h-24 w-24 shrink-0 ring-4 ring-background shadow-lg sm:h-28 sm:w-28">
              <AvatarImage src={avatar} />
              <AvatarFallback className="bg-primary/10 text-2xl text-primary">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Skeleton className="h-24 w-24 shrink-0 rounded-full sm:h-28 sm:w-28" />
          )}

          <div className="min-w-0 flex-1">
            {user ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold sm:text-3xl">{displayName}</h1>
                  {user.pronouns && (
                    <Badge variant="secondary" className="text-xs">
                      {user.pronouns}
                    </Badge>
                  )}
                  {roleLabel && (
                    <Badge className="gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-500 hover:to-orange-500">
                      {user.role === "OWNER" ? <Crown className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                      {roleLabel}
                    </Badge>
                  )}
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  @{username}
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="text-xs">UID {user.id.slice(0, 10)}</span>
                </p>

                {user.bio ? (
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/80">{user.bio}</p>
                ) : (
                  <p className="mt-3 max-w-xl text-sm italic text-muted-foreground/60">
                    还没有个性签名，去编辑资料写点什么吧 ✨
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {user.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {user.location}
                    </span>
                  )}
                  {siteConfig?.showIpLocation !== false && user.lastIpLocation && (
                    <span className="flex items-center gap-1" title="基于 IP 地址的大致位置">
                      <Globe className="h-3.5 w-3.5" />
                      IP 属地：{user.lastIpLocation}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatRelativeTime(user.createdAt)} 加入
                  </span>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-64" />
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 md:flex-col lg:flex-row">
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/settings">
              <Settings className="h-4 w-4" />
              编辑资料
            </Link>
          </Button>
          <Button asChild className="gap-1.5">
            <Link href={`/user/${userId}`}>
              <Share2 className="h-4 w-4" />
              查看主页
            </Link>
          </Button>
        </div>
      </div>

      {profile && (
        <div className="relative grid grid-cols-3 gap-px overflow-hidden border-t border-border/60 bg-border/60 sm:grid-cols-6">
          <StatCell
            icon={Users}
            label="关注"
            value={<FollowingCount userId={userId} />}
            color="text-sky-600 dark:text-sky-400"
          />
          <StatCell
            icon={Users}
            label="粉丝"
            value={<FollowersCount userId={userId} />}
            color="text-pink-600 dark:text-pink-400"
          />
          <StatCell
            icon={ThumbsUp}
            label="获赞"
            value={profile._count.likes + profile._count.gameLikes + profile._count.imagePostLikes}
            color="text-rose-600 dark:text-rose-400"
          />
          <StatCell
            icon={Star}
            label="收藏"
            value={profile._count.favorites + profile._count.gameFavorites + profile._count.imagePostFavorites}
            color="text-amber-600 dark:text-amber-400"
          />
          <StatCell
            icon={Upload}
            label="发布"
            value={profile._count.videos + profile._count.imagePosts + profile._count.games}
            color="text-violet-600 dark:text-violet-400"
          />
          <StatCell
            icon={Heart}
            label="视频"
            value={profile._count.videos}
            color="text-emerald-600 dark:text-emerald-400"
          />
        </div>
      )}
    </section>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-card px-3 py-4 transition-colors hover:bg-accent/40">
      <Icon className={cn("h-4 w-4", color)} />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums sm:text-xl">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
    </div>
  );
}

function FollowersCount({ userId }: { userId: string }) {
  const { data } = trpc.follow.counts.useQuery({ userId });
  if (!data) return <Skeleton className="inline-block h-5 w-10" />;
  return <CountUp value={data.followers} />;
}

function FollowingCount({ userId }: { userId: string }) {
  const { data } = trpc.follow.counts.useQuery({ userId });
  if (!data) return <Skeleton className="inline-block h-5 w-10" />;
  return <CountUp value={data.following} />;
}

// ==================== 快捷入口 ====================

function Shortcuts() {
  const { data: session } = useSession();
  const siteConfig = useSiteConfig();
  const { data: unreadNotifications } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled: !!session?.user,
    refetchInterval: 60_000,
  });

  const items: {
    href: string;
    label: string;
    icon: LucideIcon;
    tint: string;
    badge?: number;
    hidden?: boolean;
  }[] = [
    {
      href: "/my-works",
      label: "我的作品",
      icon: Video,
      tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
      hidden: !session?.user?.canUpload,
    },
    {
      href: "/my-series",
      label: "我的合集",
      icon: Layers,
      tint: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
      hidden: !session?.user?.canUpload,
    },
    {
      href: "/my-files",
      label: "我的文件",
      icon: Images,
      tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
    {
      href: "/favorites",
      label: "我的收藏",
      icon: Heart,
      tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    },
    {
      href: "/history",
      label: "观看历史",
      icon: Clock,
      tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      href: "/notifications",
      label: "消息通知",
      icon: Bell,
      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      badge: unreadNotifications,
    },
    {
      href: "/messages",
      label: "私信",
      icon: Mail,
      tint: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      hidden: siteConfig?.dmEnabled === false,
    },
    {
      href: "/channels",
      label: "聊天频道",
      icon: MessageSquare,
      tint: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
      hidden: siteConfig?.channelEnabled === false,
    },
    {
      href: "/settings/account",
      label: "账号安全",
      icon: Shield,
      tint: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    },
  ];

  const visibleItems = items.filter((i) => !i.hidden);

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          快捷入口
        </h2>
      </div>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 md:grid-cols-8">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex flex-col items-center gap-2 rounded-xl border border-transparent px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-border hover:bg-accent/40 hover:shadow-sm"
            >
              <div
                className={cn(
                  "relative grid h-11 w-11 place-items-center rounded-full transition-transform group-hover:scale-110",
                  item.tint,
                )}
              >
                <Icon className="h-5 w-5" />
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className="text-xs text-foreground/80 group-hover:text-foreground">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ==================== 最近发布 ====================

function RecentUploads() {
  const { data: session } = useSession();
  const canUpload = session?.user?.canUpload;

  const { data: videos, isLoading: videosLoading } = trpc.video.getMyVideos.useQuery(
    { page: 1, limit: 5, status: "ALL", sortBy: "latest" },
    { enabled: !!canUpload },
  );

  if (!canUpload) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <PanelHeader icon={Upload} title="最近发布" />
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Upload className="h-8 w-8 opacity-40" />
          <p>你的账号暂未开启上传权限</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <PanelHeader icon={Upload} title="最近发布" href="/my-works" count={videos?.totalCount} />
      {videosLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : videos?.videos?.length ? (
        <div className="space-y-1">
          {videos.videos.slice(0, 5).map((v) => (
            <Link
              key={v.id}
              href={`/video/${v.id}`}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40"
            >
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                {v.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.coverUrl} alt={v.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Video className="h-5 w-5" />
                  </div>
                )}
                <StatusBadge status={v.status} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.title}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Play className="h-3 w-3" />
                    {formatViews(v.views)}
                  </span>
                  <span>·</span>
                  <span>{formatRelativeTime(v.publishedAt ?? v.createdAt)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Upload} text="还没有发布过作品" actionHref="/upload" actionLabel="立即发布" />
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") return null;
  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: "审核中", className: "bg-amber-500/90 text-white" },
    REJECTED: { label: "未通过", className: "bg-destructive/90 text-white" },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <span className={cn("absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px]", cfg.className)}>{cfg.label}</span>
  );
}

// ==================== 最近浏览 ====================

function RecentHistory() {
  const { data, isLoading } = trpc.video.getHistory.useQuery({ page: 1, limit: 5 });

  return (
    <section className="rounded-2xl border bg-card p-5">
      <PanelHeader icon={Clock} title="最近浏览" href="/history" count={data?.totalCount} />
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : data?.history?.length ? (
        <div className="space-y-1">
          {data.history.slice(0, 5).map((v) => (
            <Link
              key={v.id}
              href={`/video/${v.id}`}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40"
            >
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                {v.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.coverUrl} alt={v.title} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Video className="h-5 w-5" />
                  </div>
                )}
                {v.progress > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/30">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, v.progress * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.title}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{v.uploader?.nickname || v.uploader?.username}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(v.watchedAt)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyHint icon={Clock} text="还没有浏览记录" actionHref="/" actionLabel="去逛逛" />
      )}
    </section>
  );
}

// ==================== 通用小组件 ====================

function PanelHeader({
  icon: Icon,
  title,
  href,
  count,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  count?: number;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
        {count != null && count > 0 && (
          <Badge variant="secondary" className="ml-1 font-normal">
            {count}
          </Badge>
        )}
      </h2>
      {href && (
        <Button asChild variant="ghost" size="sm" className="h-8 gap-0.5 text-muted-foreground hover:text-primary">
          <Link href={href}>
            查看全部
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  text,
  actionHref,
  actionLabel,
}: {
  icon: LucideIcon;
  text: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {actionHref && actionLabel && (
        <Button asChild size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

// ==================== 主组件 ====================

export function ProfileDashboard({ userId }: DashboardProps) {
  return (
    <div className="container max-w-6xl space-y-5 py-6">
      <MotionPage>
        <HeroCard userId={userId} />
      </MotionPage>

      <MotionPage>
        <Shortcuts />
      </MotionPage>

      <MotionPage>
        <div className="grid gap-5 md:grid-cols-2">
          <RecentUploads />
          <RecentHistory />
        </div>
      </MotionPage>
    </div>
  );
}
