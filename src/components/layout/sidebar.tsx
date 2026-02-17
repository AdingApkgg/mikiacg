"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Upload,
  Heart,
  History,
  Video,
  User,
  Layers,
  MessageCircle,
  BarChart3,
  Image,
  Gamepad2,
  Play,
} from "lucide-react";
import { useUIStore, type ContentMode } from "@/stores/app";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStableSession } from "@/lib/hooks";
import type { AppSession } from "@/lib/auth";
import { AdSlot } from "@/components/ads/ad-slot";

/** 侧栏仅需 user，兼容服务端 AppSession 与客户端 useSession 的 data */
type SessionWithUser = Pick<AppSession, "user"> | null;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  overlay?: boolean; // 覆盖模式（展开时覆盖内容而非推移）
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  permission?: string;
  /** 需要 canUpload 权限才显示 */
  requireUpload?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/comments", icon: MessageCircle, label: "评论动态" },
  { href: "/stats", icon: BarChart3, label: "数据总览" },
];

/** 首页右侧模式切换：视频 / 图片 / 游戏（入口预留） */
const CONTENT_MODE_OPTIONS: { id: ContentMode; label: string; icon: React.ElementType }[] = [
  { id: "video", label: "视频", icon: Play },
  { id: "image", label: "图片", icon: Image },
  { id: "game", label: "游戏", icon: Gamepad2 },
];

const userNavItems: NavItem[] = [
  { href: "/my-videos", icon: Video, label: "我的视频", auth: true, requireUpload: true },
  { href: "/my-series", icon: Layers, label: "我的合集", auth: true, requireUpload: true },
  { href: "/favorites", icon: Heart, label: "收藏", auth: true },
  { href: "/history", icon: History, label: "历史", auth: true },
];

const moreNavItems: NavItem[] = [
  { href: "/upload", icon: Upload, label: "上传", auth: true, requireUpload: true },
];

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  if (collapsed) {
    // YouTube mini sidebar: icon centered + small text below
    return (
      <Link
        href={item.href}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 transition-all",
          "hover:bg-accent/60",
          isActive && "bg-accent"
        )}
      >
        <item.icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
        <span className={cn(
          "text-[10px] leading-tight",
          isActive ? "font-semibold" : "font-normal"
        )}>
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-5 rounded-xl px-3 py-2 text-sm transition-all",
        "hover:bg-accent/60",
        isActive
          ? "bg-accent font-semibold"
          : "font-normal text-foreground"
      )}
    >
      <item.icon className={cn("h-[22px] w-[22px] shrink-0", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroup({
  title,
  items,
  collapsed,
  pathname,
  session,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  session: SessionWithUser;
}) {
  const filteredItems = items.filter((item) => {
    if (item.auth && !session) return false;
    if (item.requireUpload && (!session || !session.user?.canUpload)) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <div className={collapsed ? "space-y-0.5" : "space-y-0.5"}>
      {title && !collapsed && (
        <h3 className="mb-1 px-3 pt-1 text-sm font-semibold text-foreground">
          {title}
        </h3>
      )}
      {filteredItems.map((item) => {
        const isActive = item.href === "/"
          ? pathname === "/" || pathname === "/video" || pathname === "/game"
          : pathname === item.href || pathname.startsWith(item.href);
        return (
          <NavLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            isActive={isActive}
          />
        );
      })}
    </div>
  );
}

/** 内容模式对应的路由路径 */
const CONTENT_MODE_ROUTES: Record<ContentMode, string> = {
  video: "/video",
  image: "/video",
  game: "/game",
};

/** 内容模式切换条（视频 / 图片 / 游戏），显示在「首页」上方 */
function ContentModeSwitcher({ collapsed }: { collapsed: boolean }) {
  const contentMode = useUIStore((s) => s.contentMode);
  const chooseContentMode = useUIStore((s) => s.chooseContentMode);
  const router = useRouter();

  const handleModeChange = (mode: ContentMode) => {
    chooseContentMode(mode);
    router.push(CONTENT_MODE_ROUTES[mode]);
  };

  if (collapsed) {
    // 折叠态：纵向图标 + 小文字（YouTube mini 风格）
    return (
      <div className="flex flex-col items-center gap-0.5">
        {CONTENT_MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = contentMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleModeChange(opt.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 w-full transition-colors",
                isSelected
                  ? "bg-accent font-semibold"
                  : "text-muted-foreground hover:bg-accent/60"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 展开态：横向按钮条（胶囊 chip 风格）
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
      {CONTENT_MODE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isSelected = contentMode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleModeChange(opt.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs whitespace-nowrap transition-colors",
              isSelected
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// 用户个人主页链接
function UserProfileLink({ collapsed, session }: { collapsed: boolean; session: NonNullable<SessionWithUser> }) {
  if (collapsed) {
    // YouTube mini: avatar centered + small text
    return (
      <Link
        href={`/user/${session.user.id}`}
        className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 hover:bg-accent/60 transition-all"
      >
        <Avatar className="h-6 w-6">
          <AvatarImage src={session.user.image || undefined} alt={session.user.name || ""} />
          <AvatarFallback className="text-[10px]">
            {session.user.name?.charAt(0).toUpperCase() || <User className="h-3 w-3" />}
          </AvatarFallback>
        </Avatar>
        <span className="text-[10px] leading-tight font-normal">你</span>
      </Link>
    );
  }

  return (
    <Link
      href={`/user/${session.user.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-accent/60 transition-all"
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarImage src={session.user.image || undefined} alt={session.user.name || ""} />
        <AvatarFallback className="text-xs">
          {session.user.name?.charAt(0).toUpperCase() || <User className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{session.user.name || "我的主页"}</span>
        <span className="text-xs text-muted-foreground truncate">查看个人主页</span>
      </div>
    </Link>
  );
}

export function Sidebar({ collapsed, onToggle, overlay = false }: SidebarProps) {
  const pathname = usePathname();
  const { session } = useStableSession();

  return (
    <>
      {/* 遮罩层 - 覆盖模式展开时显示 */}
      <div 
        className={cn(
          "fixed inset-0 top-14 z-30 bg-black/50 hidden md:block transition-opacity duration-300",
          overlay && !collapsed ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggle}
      />
      
      <aside
        className={cn(
          "fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] bg-background transition-all duration-200 ease-in-out",
          "hidden md:flex md:flex-col",
          overlay 
            ? collapsed ? "w-[240px] -translate-x-full" : "w-[240px] translate-x-0"
            : collapsed ? "w-[72px]" : "w-[220px]"
        )}
      >
        <ScrollArea className="flex-1 py-2">
          <div className={cn(collapsed ? "px-1" : "px-2 space-y-2")}>
            {/* 内容模式切换 */}
            <ContentModeSwitcher collapsed={collapsed} />
            
            {/* 主导航 */}
            <NavGroup items={mainNavItems} collapsed={collapsed} pathname={pathname} session={session} />
            
            {session && (
              <>
                <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />
                
                <UserProfileLink collapsed={collapsed} session={session} />
                
                <NavGroup
                  title={collapsed ? undefined : "你的内容"}
                  items={userNavItems}
                  collapsed={collapsed}
                  pathname={pathname}
                  session={session}
                />
              </>
            )}
            
            <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />
            
            <NavGroup
              items={moreNavItems}
              collapsed={collapsed}
              pathname={pathname}
              session={session}
            />
          </div>
        </ScrollArea>

        {/* 广告位 */}
        {!collapsed && (
          <div className="px-3 pb-2">
            <AdSlot slotId="sidebar" minHeight={100} />
          </div>
        )}
      </aside>
    </>
  );
}

// 移动端侧边栏内容（用于 Sheet）
export function MobileSidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { session } = useStableSession();
  const handleClick = () => {
    onClose?.();
  };

  return (
    <ScrollArea className="h-full py-4">
      <div className="space-y-4 px-3">
        {/* 视频/图片/游戏 模式切换 */}
        <ContentModeSwitcher collapsed={false} />
        <NavGroupMobile
          items={mainNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
        
        {session && (
          <>
            <Separator />
            <NavGroupMobile
              title="你的内容"
              items={userNavItems}
              pathname={pathname}
              session={session}
              onClick={handleClick}
            />
          </>
        )}
        
        <Separator />
        
        <NavGroupMobile
          items={moreNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
      </div>
    </ScrollArea>
  );
}

function NavGroupMobile({
  title,
  items,
  pathname,
  session,
  onClick,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  session: SessionWithUser;
  onClick?: () => void;
}) {
  const filteredItems = items.filter((item) => {
    if (item.auth && !session) return false;
    if (item.requireUpload && (!session || !session.user?.canUpload)) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <div className="space-y-1">
      {title && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h3>
      )}
      {filteredItems.map((item) => {
        const isActive = item.href === "/"
          ? pathname === "/" || pathname === "/video" || pathname === "/game"
          : pathname === item.href || pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-5 rounded-xl px-3 py-2 text-sm transition-all",
              "hover:bg-accent/60",
              isActive
                ? "bg-accent font-semibold"
                : "font-normal text-foreground"
            )}
          >
            <item.icon className={cn("h-[22px] w-[22px] shrink-0", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
