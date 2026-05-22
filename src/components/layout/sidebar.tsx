"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Upload,
  User,
  MessageCircle,
  Trophy,
  Image,
  Gamepad2,
  Play,
  LayoutGrid,
  TrendingUp,
  Hash,
  Mail,
  Link2,
  type LucideIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStableSession } from "@/lib/hooks";
import type { AppSession } from "@/lib/auth";
import { AdSlot } from "@/components/ads/ad-slot";
import { SidebarFooter } from "./sidebar-footer";
import { useSiteConfig } from "@/contexts/site-config";
import { CompositeNsfwToggle } from "@/components/composite/composite-nsfw-toggle";

/** 侧栏仅需 user，兼容服务端 AppSession 与客户端 useSession 的 data */
type SessionWithUser = Pick<AppSession, "user"> | null;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  overlay?: boolean; // 覆盖模式（展开时覆盖内容而非推移）
  initialHideNsfw?: boolean;
}

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  auth?: boolean;
  permission?: string;
  /** 需要 canUpload 权限才显示 */
  requireUpload?: boolean;
}

// 「综合 / 视频 / 图片 / 游戏」是分区入口，由站点 config 控制是否启用，sidebar 渲染时
// 通过 useEnabledContentModes() 动态过滤后插入到主菜单顶部。综合 = 站点首页 `/`，
// 由 `src/app/page.tsx` 直接渲染聚合内容。
const sectionNavItems: NavItem[] = [
  { href: "/", icon: LayoutGrid, label: "综合" },
  { href: "/video", icon: Play, label: "视频" },
  { href: "/image", icon: Image, label: "图片" },
  { href: "/game", icon: Gamepad2, label: "游戏" },
];

// 主菜单（站点级功能）：「首页 /」原本就 redirect /video，跟分区入口里的
// 「视频」完全重复，删掉。
const mainNavItems: NavItem[] = [
  { href: "/ranking", icon: Trophy, label: "热门排行" },
  { href: "/tags", icon: Hash, label: "标签广场" },
  { href: "/comments", icon: MessageCircle, label: "评论动态" },
  { href: "/links", icon: Link2, label: "友情链接" },
];

const allCommunityNavItems: NavItem[] = [
  { href: "/channels", icon: Hash, label: "频道", auth: true },
  { href: "/messages", icon: Mail, label: "私信", auth: true },
];

// 「我的xxx」原本分散为作品/文件/收藏/历史 4 个 sidebar 入口，
// 合并到一个「个人中心」-> /profile dashboard，dashboard 内已有快捷入口跳转到子页面。
// 命名上避免和 UserProfileLink (头像 → /user/[id] 对外主页) 混淆。
const userNavItems: NavItem[] = [{ href: "/profile", icon: User, label: "个人中心", auth: true }];

const moreNavItems: NavItem[] = [
  { href: "/upload", icon: Upload, label: "发布内容", auth: true, requireUpload: true },
  { href: "/promotion", icon: TrendingUp, label: "推广中心", auth: true },
];

function NavLink({
  item,
  collapsed,
  isActive,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  onClick?: () => void;
}) {
  if (collapsed) {
    // YouTube mini sidebar: icon centered + small text below
    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 transition-[background-color] duration-150 ease-out",
          "hover:bg-accent/60",
          isActive && "bg-accent",
        )}
      >
        <item.icon className={cn("h-5 w-5", isActive ? "stroke-[2.5px]" : "stroke-[1.5px]")} />
        <span className={cn("text-[10px] leading-tight", isActive ? "font-semibold" : "font-normal")}>
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-5 rounded-xl px-3 py-2 text-sm transition-[background-color] duration-150 ease-out",
        "hover:bg-accent/60",
        isActive ? "bg-accent font-semibold" : "font-normal text-foreground",
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
  onItemClick,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  session: SessionWithUser;
  onItemClick?: () => void;
}) {
  const filteredItems = items.filter((item) => {
    if (item.auth && !session) return false;
    if (item.requireUpload && (!session || !session.user?.canUpload)) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <div className={collapsed ? "space-y-0.5" : "space-y-0.5"}>
      {title && !collapsed && <h3 className="mb-1 px-3 pt-1 text-sm font-semibold text-foreground">{title}</h3>}
      {filteredItems.map((item) => {
        // 根路径 `/` 只在路径完全相等时激活，避免 `pathname.startsWith("/")` 永远命中
        const isActive =
          item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href);
        return <NavLink key={item.href} item={item} collapsed={collapsed} isActive={isActive} onClick={onItemClick} />;
      })}
    </div>
  );
}

/** 根据站点配置过滤可用的内容分区 NavItem */
function useEnabledSectionNavItems(): NavItem[] {
  const config = useSiteConfig();
  return sectionNavItems.filter((item) => {
    if (item.href === "/") return config?.sectionCompositeEnabled !== false;
    if (item.href === "/video") return config?.sectionVideoEnabled !== false;
    if (item.href === "/image") return config?.sectionImageEnabled !== false;
    if (item.href === "/game") return config?.sectionGameEnabled !== false;
    return true;
  });
}

// 用户个人主页链接
function UserProfileLink({ collapsed, session }: { collapsed: boolean; session: NonNullable<SessionWithUser> }) {
  if (collapsed) {
    // YouTube mini: avatar centered + small text
    return (
      <Link
        href={`/user/${session.user.id}`}
        className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 hover:bg-accent/60 transition-[background-color] duration-150 ease-out"
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
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-accent/60 transition-[background-color] duration-150 ease-out"
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

/** 根据站点配置过滤社区导航项（频道/私信） */
function useCommunityNavItems() {
  const config = useSiteConfig();
  return allCommunityNavItems.filter((item) => {
    if (item.href === "/channels") return config?.channelEnabled !== false;
    if (item.href === "/messages") return config?.dmEnabled !== false;
    return true;
  });
}

/** 侧栏导航内容（桌面 & 移动端共用） */
export function SidebarContent({
  collapsed = false,
  onItemClick,
  initialHideNsfw = false,
}: {
  collapsed?: boolean;
  onItemClick?: () => void;
  initialHideNsfw?: boolean;
}) {
  const pathname = usePathname();
  const { session } = useStableSession();
  const communityNavItems = useCommunityNavItems();
  const enabledSectionItems = useEnabledSectionNavItems();

  return (
    <div className={cn(collapsed ? "px-1" : "px-2 space-y-2")}>
      {/* 内容分区：综合/视频/图片/游戏。仅保留侧边栏入口，避免内容区顶部重复分区切换。 */}
      {enabledSectionItems.length > 0 && (
        <NavGroup
          items={enabledSectionItems}
          collapsed={collapsed}
          pathname={pathname}
          session={session}
          onItemClick={onItemClick}
        />
      )}

      {enabledSectionItems.length > 0 && <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />}

      <NavGroup
        items={mainNavItems}
        collapsed={collapsed}
        pathname={pathname}
        session={session}
        onItemClick={onItemClick}
      />

      <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />
      <CompositeNsfwToggle hideNsfw={initialHideNsfw} collapsed={collapsed} />

      {session && (
        <>
          <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />

          <UserProfileLink collapsed={collapsed} session={session} />

          {/* 个人中心紧贴头像下方，单项无需分组标题 */}
          <NavGroup
            items={userNavItems}
            collapsed={collapsed}
            pathname={pathname}
            session={session}
            onItemClick={onItemClick}
          />

          <NavGroup
            title={collapsed ? undefined : "社区"}
            items={communityNavItems}
            collapsed={collapsed}
            pathname={pathname}
            session={session}
            onItemClick={onItemClick}
          />
        </>
      )}

      <Separator className={collapsed ? "mx-auto w-10 my-1" : "my-2"} />

      <NavGroup
        items={moreNavItems}
        collapsed={collapsed}
        pathname={pathname}
        session={session}
        onItemClick={onItemClick}
      />

      {/* 紧凑版 footer：参考抖音/YouTube，把备案/链接/版权放在 sidebar 底部，
          主内容区不再渲染 Footer (移动端例外)。collapsed 状态下 sidebar 太窄塞不下，
          隐藏。 */}
      {!collapsed && (
        <>
          <Separator className="my-2" />
          <SidebarFooter />
        </>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  overlay = false,
  initialHideNsfw = false,
}: SidebarProps) {
  return (
    <>
      {/* 遮罩层 - 覆盖模式展开时显示 */}
      <div
        className={cn(
          "fixed inset-0 top-14 z-30 bg-black/50 hidden md:block transition-opacity duration-300",
          overlay && !collapsed ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onToggle}
      />

      <aside
        className={cn(
          "fixed left-0 top-14 z-40 h-[calc(100vh-3.5rem)] bg-sidebar border-r border-sidebar-border transition-[width,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "hidden md:flex md:flex-col",
          overlay
            ? collapsed
              ? "w-[240px] -translate-x-full"
              : "w-[240px] translate-x-0"
            : collapsed
              ? "w-[72px]"
              : "w-[220px]",
        )}
      >
        <ScrollArea className="flex-1 min-h-0 py-2">
          <SidebarContent collapsed={collapsed} initialHideNsfw={initialHideNsfw} />
        </ScrollArea>

        {/* 广告位 - 固定底部，不随导航滚动 */}
        <div className={cn("shrink-0 border-t", collapsed ? "px-1 py-2" : "px-3 py-2")}>
          <AdSlot slotId="sidebar" minHeight={100} />
        </div>
      </aside>
    </>
  );
}
