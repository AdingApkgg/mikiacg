"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Upload,
  Heart,
  User,
  Compass,
} from "lucide-react";
import { useStableSession } from "@/lib/hooks";
import { useIsMounted } from "@/components/motion";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  loginHref?: string;
  /** 需要 canUpload 权限才显示 */
  requireUpload?: boolean;
}

const navItems: NavItem[] = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/search", icon: Compass, label: "发现" },
  { href: "/upload", icon: Upload, label: "上传", auth: true, loginHref: "/login", requireUpload: true },
  { href: "/favorites", icon: Heart, label: "收藏", auth: true, loginHref: "/login" },
  { href: "/settings", icon: User, label: "我的", auth: true, loginHref: "/login" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { session } = useStableSession();
  // 避免水合不匹配：useIsMounted 基于 ref，不触发 set-state-in-effect lint
  const mounted = useIsMounted();

  // 未挂载前按 session=null 渲染，与 SSR 输出一致
  const effectiveSession = mounted ? session : null;

  const visibleItems = navItems.filter((item) => {
    // 需要上传权限的项，检查 canUpload
    if (item.requireUpload && (!effectiveSession || !effectiveSession.user?.canUpload)) return false;
    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden safe-area-bottom">
      <div className="flex h-14 items-center justify-around px-1">
        {visibleItems.map((item) => {
          const href = item.auth && !effectiveSession ? (item.loginHref || "/login") : item.href;
          const isActive = item.href === "/"
            ? pathname === "/" || pathname === "/video" || pathname === "/game"
            : pathname === item.href || pathname.startsWith(item.href);
          
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-all min-w-[52px] flex-1 max-w-[72px]",
                "active:scale-90",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* 活跃指示器 */}
              {isActive && (
                <span className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-primary" />
              )}
              <item.icon
                className={cn(
                  "h-[22px] w-[22px] transition-all",
                  isActive ? "stroke-[2.5px]" : "stroke-[1.8px]"
                )}
              />
              <span className={cn(
                "text-[10px] leading-tight transition-all",
                isActive ? "font-semibold" : "font-medium"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
