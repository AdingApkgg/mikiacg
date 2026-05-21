"use client";

import Link from "next/link";
import Image from "next/image";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Search,
  Menu,
  User,
  Settings as SettingsIcon,
  LogOut,
  Heart,
  History,
  Shield,
  LogIn,
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Gamepad2,
  Images,
  Layers,
  Volume2,
  VolumeX,
  Coins,
  MessageSquare,
  Mail,
  Inbox,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { trpc } from "@/lib/trpc";
import { useDebounce, useStableSession } from "@/lib/hooks";
import { useSearchHistoryStore } from "@/stores/app";
import { useUserStore } from "@/stores/user";
import { playSound } from "@/lib/audio";
import { useSound } from "@/hooks/use-sound";
import { cn } from "@/lib/utils";
import { isPrivileged } from "@/lib/permissions";
import { useSiteConfig } from "@/contexts/site-config";
import { showPointsToast } from "@/lib/toast-with-sound";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useSocketStore } from "@/stores/socket";
import { SearchDiscover } from "@/components/search/search-discover";

interface HeaderProps {
  onMenuClick?: () => void;
}

// ========== 搜索建议列表（仅在用户输入时展示，空态由 SearchDiscover 接管） ==========

interface SuggestionItem {
  type: "search" | "tag" | "video" | "game" | "imagePost" | "user";
  label: string;
  value: string;
}

function SearchSuggestionsList({
  items,
  activeIndex,
  onSelect,
}: {
  items: SuggestionItem[];
  activeIndex: number;
  onSelect: (item: SuggestionItem) => void;
}) {
  return (
    <div className="py-1">
      {items.map((item, i) => (
        <button
          key={`${item.type}-${item.value}-${i}`}
          type="button"
          data-index={i}
          onClick={() => onSelect(item)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
            activeIndex === i ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          {(item.type === "search" || item.type === "tag" || item.type === "video") && (
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          {item.type === "game" && <Gamepad2 className="h-4 w-4 text-muted-foreground shrink-0" />}
          {item.type === "imagePost" && <Images className="h-4 w-4 text-muted-foreground shrink-0" />}
          {item.type === "user" && <User className="h-4 w-4 text-muted-foreground shrink-0" />}

          <span className="flex-1 truncate">{item.type === "tag" ? `#${item.label}` : item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 偏好设置：在用户菜单下拉里展示 主题三选 + 音效开关，避免常驻 header */
function ThemeSoundPrefs() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsMounted();
  const soundEnabled = useUserStore((s) => s.preferences.soundEnabled);
  const soundVolume = useUserStore((s) => s.preferences.soundVolume);
  const setPreference = useUserStore((s) => s.setPreference);

  return (
    <div className="px-2 py-1.5 space-y-1.5">
      {/* 主题三选 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-10 shrink-0 pl-1">主题</span>
        <div className="flex flex-1 items-center rounded-full bg-muted/60 p-0.5 gap-0.5">
          {(
            [
              { value: "system", icon: Monitor, label: "跟随" },
              { value: "light", icon: Sun, label: "浅色" },
              { value: "dark", icon: Moon, label: "深色" },
            ] as const
          ).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-label={label}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 h-7 rounded-full transition-colors text-xs",
                mounted && theme === value
                  ? "bg-background shadow-sm text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 音效开关 */}
      <button
        type="button"
        onClick={() => {
          const next = !soundEnabled;
          setPreference("soundEnabled", next);
          if (next) playSound("toggle", soundVolume);
        }}
        className="w-full flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent text-sm transition-colors"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          界面音效
        </span>
        <span
          className={cn("text-xs font-medium tabular-nums", soundEnabled ? "text-primary" : "text-muted-foreground")}
        >
          {soundEnabled ? "开" : "关"}
        </span>
      </button>
    </div>
  );
}

function MessageButton() {
  const { session } = useStableSession();
  const storeUnread = useSocketStore((s) => s.unreadMessages);
  const config = useSiteConfig();

  const dmEnabled = config?.dmEnabled !== false;

  const { data: convData } = trpc.message.conversations.useQuery(
    { limit: 50 },
    {
      enabled: !!session?.user && dmEnabled,
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  if (!dmEnabled) return null;

  const serverUnread = convData?.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const unread = serverUnread ?? storeUnread;

  return (
    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full relative" asChild>
      <Link href="/messages" aria-label="私信">
        <MessageSquare className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

export function Header({ onMenuClick }: HeaderProps) {
  const siteConfig = useSiteConfig();
  const { session, isLoading: sessionLoading } = useStableSession();
  const { play } = useSound();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Zustand 搜索历史
  const { addSearch } = useSearchHistoryStore();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mounted = useIsMounted();
  const router = useRouter();

  const isLoading = !mounted || sessionLoading;

  // 用户积分
  const { data: meData } = trpc.user.me.useQuery(undefined, {
    enabled: !!session?.user,
    staleTime: 60_000,
  });

  // 每日登录积分
  const dailyLoginMutation = trpc.referral.claimDailyLogin.useMutation({
    onSuccess: (data) => {
      if (data.awarded) showPointsToast(data.points);
    },
  });
  const dailyLoginCalledRef = useRef(false);
  useEffect(() => {
    if (session?.user && !dailyLoginCalledRef.current) {
      dailyLoginCalledRef.current = true;
      dailyLoginMutation.mutate();
    }
  }, [session?.user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 防抖搜索
  const debouncedQuery = useDebounce(searchQuery, 300);

  // 获取搜索建议（仅输入时）
  const { data: suggestions } = trpc.video.searchSuggestions.useQuery(
    { query: debouncedQuery, limit: 8 },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 60000,
    },
  );

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 打开移动搜索时聚焦输入框
  useEffect(() => {
    if (showMobileSearch) {
      // 小延迟确保 DOM 已渲染
      const timer = setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [showMobileSearch]);

  // 记录搜索到服务器
  const recordSearchMutation = trpc.video.recordSearch.useMutation();

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        const trimmed = query.trim();
        addSearch(trimmed);
        recordSearchMutation.mutate({ keyword: trimmed });
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        setShowMobileSearch(false);
        setShowSuggestions(false);
        setSearchQuery("");
        setActiveIndex(-1);
      }
    },
    [router, recordSearchMutation, addSearch],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setActiveIndex(-1);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 如果有选中的建议项，使用它
    if (activeIndex >= 0 && activeIndex < suggestionItems.length) {
      handleSuggestionSelect(suggestionItems[activeIndex]);
      return;
    }
    handleSearch(searchQuery);
  };

  const handleSuggestionSelect = useCallback(
    (item: SuggestionItem) => {
      setShowSuggestions(false);
      setShowMobileSearch(false);
      setActiveIndex(-1);

      switch (item.type) {
        case "search":
          handleSearch(item.value);
          break;
        case "tag":
          setSearchQuery("");
          router.push(`/tag/${item.value}`);
          break;
        case "video":
          setSearchQuery("");
          router.push(`/video/${item.value}`);
          break;
        case "game":
          setSearchQuery("");
          router.push(`/game/${item.value}`);
          break;
        case "imagePost":
          setSearchQuery("");
          router.push(`/image/${item.value}`);
          break;
        case "user":
          setSearchQuery("");
          router.push(`/user/${item.value}`);
          break;
      }
    },
    [handleSearch, router],
  );

  // ========== 构建输入时的建议项列表（空态由 SearchDiscover 渲染） ==========
  const hasInput = debouncedQuery.length >= 1;
  const suggestionItems: SuggestionItem[] = [];
  if (hasInput) {
    suggestionItems.push({ type: "search", label: searchQuery, value: searchQuery });
    if (suggestions) {
      for (const tag of suggestions.tags) suggestionItems.push({ type: "tag", label: tag.name, value: tag.slug });
      for (const video of suggestions.videos)
        suggestionItems.push({ type: "video", label: video.title, value: video.id });
      for (const game of suggestions.games ?? [])
        suggestionItems.push({ type: "game", label: game.title, value: game.id });
      for (const post of suggestions.imagePosts ?? [])
        suggestionItems.push({ type: "imagePost", label: post.title, value: post.id });
      for (const u of suggestions.users ?? [])
        suggestionItems.push({ type: "user", label: u.displayName, value: u.id });
    }
  }

  const hasSuggestionItems = suggestionItems.length > 0;

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasSuggestionItems) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestionItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev <= 0 ? suggestionItems.length - 1 : prev - 1));
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    },
    [hasSuggestionItems, suggestionItems.length],
  );

  // activeIndex 在搜索输入变化时通过 handleSearchChange 重置

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-md shadow-sm">
        <div className="flex h-14 items-center">
          {/* Left: Menu + Logo */}
          <div className="flex items-center shrink-0 h-full px-2 md:px-4">
            {/* Desktop Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex h-10 w-10 rounded-full shrink-0"
              onClick={() => {
                onMenuClick?.();
                play("swoosh");
              }}
              aria-label="切换侧边栏"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* 移动端菜单入口已迁移至 BottomNav（底部"菜单"按钮） */}

            {/* Logo */}
            <Link href="/" className="flex items-center ml-1">
              <Image
                src={siteConfig?.siteLogo || "/default-logo.svg"}
                alt={siteConfig?.siteName || "ACGN Site"}
                width={108}
                height={28}
                className="h-7"
                style={{ width: "auto" }}
                priority
                unoptimized
              />
            </Link>
          </div>

          {/* Center: YouTube-style pill search bar */}
          <div className="flex-1 flex justify-center px-2 md:px-6 lg:px-12">
            <form onSubmit={handleSearchSubmit} className="hidden md:flex w-full max-w-[560px]">
              <div className="relative w-full">
                <div className="flex">
                  <div className="relative flex-1">
                    <Input
                      ref={searchInputRef}
                      type="search"
                      placeholder="搜索"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => {
                        setShowSuggestions(true);
                        play("click");
                      }}
                      onKeyDown={handleKeyDown}
                      className="h-10 sm:h-10 rounded-l-full rounded-r-none border border-r-0 pl-4 pr-3 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="h-10 rounded-l-none rounded-r-full border border-l-0 border-input px-5 bg-muted/60 hover:bg-muted"
                  >
                    <Search className="h-5 w-5" />
                  </Button>
                </div>

                {/* 搜索建议下拉 */}
                {showSuggestions && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-2xl shadow-xl z-50 overflow-hidden max-h-[480px] overflow-y-auto"
                  >
                    {hasInput ? (
                      hasSuggestionItems && (
                        <SearchSuggestionsList
                          items={suggestionItems}
                          activeIndex={activeIndex}
                          onSelect={handleSuggestionSelect}
                        />
                      )
                    ) : (
                      <SearchDiscover
                        variant="menu"
                        onSearchKeyword={handleSearch}
                        onNavigate={() => {
                          setShowSuggestions(false);
                          setActiveIndex(-1);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Right: Search (mobile) + User */}
          <div className="flex items-center gap-0.5 shrink-0 pr-2 md:pr-4">
            {/* Mobile Search Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10 rounded-full"
              onClick={() => {
                setShowMobileSearch(true);
                play("click");
              }}
              aria-label="搜索"
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Messages */}
            {!isLoading && session?.user && <MessageButton />}

            {/* Notification Bell */}
            {!isLoading && session?.user && <NotificationBell />}

            {isLoading ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ) : session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="relative h-8 w-8 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ml-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={session.user.image || undefined} alt={session.user.name || ""} />
                      <AvatarFallback className="text-xs">
                        {session.user.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 rounded-xl">
                  <DropdownMenuLabel className="font-normal px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={session.user.image || undefined} />
                        <AvatarFallback>{session.user.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col space-y-0.5 leading-none min-w-0">
                        <p className="font-medium truncate">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{session.user.email || ""}</p>
                      </div>
                    </div>
                    {meData?.points !== undefined && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <Coins className="h-3.5 w-3.5" />
                        <span className="font-medium">{meData.points.toLocaleString()} 积分</span>
                      </div>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      个人中心
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <SettingsIcon className="mr-2 h-4 w-4" />
                      账号设置
                    </Link>
                  </DropdownMenuItem>
                  {session.user?.canUpload && (
                    <DropdownMenuItem asChild>
                      <Link href="/my-works">
                        <Layers className="mr-2 h-4 w-4" />
                        我的作品
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {siteConfig?.channelEnabled !== false && (
                    <DropdownMenuItem asChild>
                      <Link href="/channels">
                        <MessageSquare className="mr-2 h-4 w-4" />
                        聊天频道
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {siteConfig?.dmEnabled !== false && (
                    <DropdownMenuItem asChild>
                      <Link href="/messages">
                        <Mail className="mr-2 h-4 w-4" />
                        私信
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link href="/favorites">
                      <Heart className="mr-2 h-4 w-4" />
                      我的收藏
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/history">
                      <History className="mr-2 h-4 w-4" />
                      观看历史
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/feedback">
                      <Inbox className="mr-2 h-4 w-4" />
                      反馈与求助
                    </Link>
                  </DropdownMenuItem>
                  {isPrivileged(session.user.role ?? "") && (
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard">
                        <Shield className="mr-2 h-4 w-4" />
                        管理面板
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {/* 偏好设置：主题 + 音效（从 header 工具栏迁移） */}
                  <ThemeSoundPrefs />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" asChild className="rounded-full px-4 h-9 gap-1.5 ml-1">
                <Link href="/login">
                  <LogIn className="h-4 w-4" />
                  <span>登录</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ========== 移动端全屏搜索覆盖层 ========== */}
      {showMobileSearch && (
        <div className="fixed inset-0 z-[60] bg-background md:hidden flex flex-col">
          {/* 顶部搜索栏 */}
          <div className="flex items-center gap-2 px-2 h-14 border-b shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                setShowMobileSearch(false);
                setSearchQuery("");
                setActiveIndex(-1);
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <form onSubmit={handleSearchSubmit} className="flex-1 flex">
              <Input
                ref={mobileSearchInputRef}
                type="search"
                placeholder="搜索视频、游戏、标签..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10 sm:h-10"
                autoComplete="off"
              />
              <Button
                type="submit"
                variant="secondary"
                className="rounded-l-none border border-input border-l-0 px-4 h-10"
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {/* 建议内容 */}
          <div className="flex-1 overflow-y-auto">
            {hasInput ? (
              hasSuggestionItems ? (
                <SearchSuggestionsList
                  items={suggestionItems}
                  activeIndex={activeIndex}
                  onSelect={handleSuggestionSelect}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Search className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">输入关键词开始搜索</p>
                </div>
              )
            ) : (
              <SearchDiscover
                variant="menu"
                onSearchKeyword={handleSearch}
                onNavigate={() => setShowMobileSearch(false)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
