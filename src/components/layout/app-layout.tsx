"use client";

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { TmaLayoutBridge } from "./tma-layout-bridge";
import { NavigationProgress } from "./navigation-progress";
import { AdGate } from "@/components/ads/ad-gate";
import { FloatingAd } from "@/components/ads/floating-ad";
import { AppDownloadPopup } from "@/components/dialogs/app-download-popup";
import { KeyboardShortcutsDialog } from "@/components/ui/keyboard-shortcuts-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ShortcutRegistryProvider } from "@/contexts/shortcut-registry";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/motion";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useIsTMA } from "@/hooks/use-tma";

const SIDEBAR_COLLAPSED_KEY = "mikiacg-sidebar-collapsed";

// 这些页面侧边栏覆盖模式（展开时覆盖内容，不推移）
const overlaySidebarPaths = ["/video/"];

// 这些页面完全不显示侧边栏
const noSidebarPaths = ["/login", "/register", "/forgot-password"];

function isOverlaySidebarPage(pathname: string): boolean {
  return overlaySidebarPaths.some((path) => pathname.startsWith(path));
}

function shouldHideSidebar(pathname: string): boolean {
  return noSidebarPaths.some((path) => pathname.startsWith(path));
}

export function AppLayout({ children, initialHideNsfw = false }: { children: React.ReactNode; initialHideNsfw?: boolean }) {
  const pathname = usePathname();
  const mounted = useIsMounted();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  // TMA 环境下 Telegram 原生提供 Header/BackButton，前端应隐藏 Footer、Sidebar 以及桌面端 Header
  const isTMA = useIsTMA();

  // 判断页面类型
  const isOverlayMode = isOverlaySidebarPage(pathname);
  const isNoSidebarPage = shouldHideSidebar(pathname);

  // YouTube 风格：使用 useSyncExternalStore 读取 localStorage
  // 避免 effect 内 setState，同时 SSR 返回 server snapshot（true）
  const subscribeSidebar = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    return () => window.removeEventListener("storage", cb);
  }, []);
  const getSidebarSnapshot = useCallback(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved !== "true";
  }, []);
  const sidebarExpanded = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, () => true);

  const setSidebarExpanded = useCallback((expanded: boolean) => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!expanded));
    // 触发同窗口的 storage 事件以通知 useSyncExternalStore
    window.dispatchEvent(new StorageEvent("storage", { key: SIDEBAR_COLLAPSED_KEY, newValue: String(!expanded) }));
  }, []);

  // 视频页面独立的展开状态（默认隐藏）
  const [videoPageSidebarOpen, setVideoPageSidebarOpen] = useState(false);

  // 追踪上一次的 pathname 来重置视频页面侧边栏
  const prevPathnameRef = useRef(pathname);

  // 切换页面时重置视频页面的侧边栏状态
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      // 使用 requestAnimationFrame 避免同步 setState
      requestAnimationFrame(() => setVideoPageSidebarOpen(false));
    }
  }, [pathname]);

  const toggleSidebar = () => {
    if (isOverlayMode) {
      // 视频页面只切换临时覆盖状态
      setVideoPageSidebarOpen((prev) => !prev);
    } else {
      // 其他页面切换全局状态并保存
      setSidebarExpanded(!sidebarExpanded);
    }
  };

  // 是否显示侧边栏组件（非覆盖模式始终显示，覆盖模式需等待挂载）
  // TMA 环境下强制隐藏侧边栏（桌面端布局），统一走移动端底部导航
  const showSidebar = isTMA ? false : isOverlayMode ? mounted && !isNoSidebarPage : !isNoSidebarPage;

  // 侧边栏是否展开
  const isExpanded = isOverlayMode ? videoPageSidebarOpen : sidebarExpanded;

  // 是否使用覆盖模式
  const useOverlayMode = isOverlayMode;

  return (
    <ShortcutRegistryProvider>
      <div className="relative min-h-screen flex flex-col overflow-x-hidden">
        {/* 顶部导航进度条 */}
        <NavigationProgress />

        {/* TMA 与普通网页共用同一 Header；Telegram 原生 BackButton 仍由 TmaLayoutBridge 处理 */}
        <Header onMenuClick={toggleSidebar} />

        {/* Header 是 fixed 定位，需要占位让内容不被遮挡 */}
        <div className="h-14 shrink-0" />

        {/* TMA 侧路由桥接：将 next/navigation 与 tg.BackButton 联动 */}
        <TmaLayoutBridge />

        <div className="flex flex-1">
          {/* 桌面端侧边栏 */}
          {showSidebar && (
            <Sidebar
              collapsed={!isExpanded}
              onToggle={toggleSidebar}
              overlay={useOverlayMode}
              initialHideNsfw={initialHideNsfw}
            />
          )}

          {/* 主内容区 */}
          <main
            className={cn(
              "flex-1 flex flex-col min-h-[calc(100vh-3.5rem)] min-w-0 overflow-x-hidden transition-[margin] duration-200",
              // YouTube 风格：展开时内容区推移（非覆盖模式）
              showSidebar && !useOverlayMode && isExpanded && "md:ml-[220px]",
              showSidebar && !useOverlayMode && !isExpanded && "md:ml-[72px]",
              // 覆盖模式：固定小边距
              showSidebar && useOverlayMode && "md:ml-0",
              // 移动端为底部导航栏留出空间
              !isOverlayMode && "pb-16 md:pb-0",
            )}
          >
            <div className="flex-1 relative">
              <PageTransition>{children}</PageTransition>
            </div>
            {/* TMA 环境下隐藏 Footer。
              桌面端: footer 内容已挪到 sidebar 底部 (参考抖音/YouTube)，主区不再渲染。
              移动端 (<md): sidebar 是抽屉式的常态隐藏，主区底部仍渲染 Footer 让用户能看到版权/备案。 */}
            {!isTMA && (
              <div className="md:hidden">
                <Footer />
              </div>
            )}
          </main>
        </div>

        {/* 移动端底部导航栏；TMA 环境也保留（侧边栏已隐藏） */}
        {(isTMA || showSidebar) && !isOverlayMode && !isNoSidebarPage && (
          <BottomNav initialHideNsfw={initialHideNsfw} />
        )}

        {/* 全局命令面板 */}
        <CommandPalette />

        {/* 赞助商广告门（启用且未达免广告时段时显示） */}
        <AdGate />

        {/* 左下角悬浮广告（桌面端） */}
        {!isTMA && !isNoSidebarPage && <FloatingAd />}

        {/* 快捷键帮助对话框 */}
        <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />

        {/* APP 下载推荐弹窗（TMA、后台、登录注册页不展示） */}
        {!isTMA && !isNoSidebarPage && !pathname.startsWith("/dashboard") && <AppDownloadPopup />}
      </div>
    </ShortcutRegistryProvider>
  );
}
