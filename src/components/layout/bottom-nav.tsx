"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Home, Menu, Compass, MessageSquare, User, type LucideIcon } from "lucide-react";
import { useStableSession } from "@/lib/hooks";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useSiteConfig } from "@/contexts/site-config";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarContent } from "./sidebar";
import { AdSlot } from "@/components/ads/ad-slot";

interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
  auth?: boolean;
  loginHref?: string;
  /** 需要 canUpload 权限才显示 */
  requireUpload?: boolean;
}

// 前 4 项为直达链接；最后一项固定为"菜单"，接手原 Header 移动端左上角的汉堡菜单入口。
// 「发布内容」对普通用户隐藏（需要 canUpload 权限），有权限的用户可从菜单里进入。
const navItems: NavItem[] = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/search", icon: Compass, label: "发现" },
  { href: "/channels", icon: MessageSquare, label: "消息", auth: true, loginHref: "/login" },
  { href: "/profile", icon: User, label: "我的", auth: true, loginHref: "/login" },
];

export function BottomNav({ initialHideNsfw = false }: { initialHideNsfw?: boolean }) {
  const pathname = usePathname();
  const { session } = useStableSession();
  const siteConfig = useSiteConfig();
  // 避免水合不匹配：useIsMounted 基于 ref，不触发 set-state-in-effect lint
  const mounted = useIsMounted();
  const [menuOpen, setMenuOpen] = useState(false);

  // 未挂载前按 session=null 渲染，与 SSR 输出一致
  const effectiveSession = mounted ? session : null;

  const visibleItems = navItems.filter((item) => {
    if (item.requireUpload && (!effectiveSession || !effectiveSession.user?.canUpload)) return false;
    if (item.href === "/channels" && siteConfig?.channelEnabled === false && siteConfig?.dmEnabled === false)
      return false;
    return true;
  });

  const tabClass =
    "relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl min-w-[52px] flex-1 max-w-[72px] transition-colors duration-200 ease-out active:scale-90 active:transition-transform active:duration-100";

  return (
    <>
      {/* md:hidden 是浏览器行为；TMA 始终是移动端布局，[html[data-tma]_&] 强制在所有断点显示 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden [html[data-tma]_&]:!block safe-area-bottom">
        <div className="flex h-14 items-center justify-around px-1">
          {visibleItems.map((item) => {
            const href = item.auth && !effectiveSession ? item.loginHref || "/login" : item.href;
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname === "/video" || pathname === "/image" || pathname === "/game"
                : pathname === item.href || pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(tabClass, isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                {isActive && <span className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-primary" />}
                <item.icon
                  className={cn(
                    "h-[22px] w-[22px] transition-[stroke-width] duration-200",
                    isActive ? "stroke-[2.5px]" : "stroke-[1.8px]",
                  )}
                />
                <span className={cn("text-[10px] leading-tight", isActive ? "font-semibold" : "font-medium")}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="打开菜单"
            className={cn(tabClass, menuOpen ? "text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            <Menu
              className={cn(
                "h-[22px] w-[22px] transition-[stroke-width] duration-200",
                menuOpen ? "stroke-[2.5px]" : "stroke-[1.8px]",
              )}
            />
            <span className={cn("text-[10px] leading-tight", menuOpen ? "font-semibold" : "font-medium")}>菜单</span>
          </button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="shrink-0 border-b px-4 py-4">
            <SheetTitle>
              <Link href="/" className="flex items-center font-bold text-xl" onClick={() => setMenuOpen(false)}>
                {siteConfig?.siteName || "ACGN Site"}
              </Link>
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0 py-4">
            <SidebarContent onItemClick={() => setMenuOpen(false)} initialHideNsfw={initialHideNsfw} />
          </ScrollArea>
          <div className="shrink-0 border-t px-3 py-2">
            <AdSlot slotId="sidebar" minHeight={100} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
