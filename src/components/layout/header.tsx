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
import { AccountSwitcher } from "@/components/auth/account-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Search,
  Menu,
  User,
  LogOut,
  Heart,
  History,
  Video,
  Shield,
  LogIn,
  UserPlus,
  Clock,
  TrendingUp,
  X,
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Gamepad2,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MobileSidebarContent } from "./sidebar";
import { useIsMounted } from "@/components/motion";
import { trpc } from "@/lib/trpc";
import { useDebounce, useStableSession } from "@/lib/hooks";
import { useSearchHistoryStore } from "@/stores/app";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuClick?: () => void;
}

// ========== 搜索建议列表（桌面 + 移动端共用） ==========

interface SuggestionItem {
  type: "search" | "history" | "tag" | "video" | "game" | "hot";
  label: string;
  value: string;
  index?: number;
  isHot?: boolean;
}

function SearchSuggestionsList({
  items,
  activeIndex,
  onSelect,
  onRemoveHistory,
  onClearHistory,
  showHistoryHeader,
  showHotHeader,
}: {
  items: SuggestionItem[];
  activeIndex: number;
  onSelect: (item: SuggestionItem) => void;
  onRemoveHistory?: (query: string) => void;
  onClearHistory?: () => void;
  showHistoryHeader: boolean;
  showHotHeader: boolean;
}) {
  return (
    <div className="py-1">
      {items.map((item, i) => {
        const needsHeader = i === 0 || items[i - 1].type !== item.type;

        return (
          <div key={`${item.type}-${item.value}-${i}`}>
            {/* 分组标题 */}
            {needsHeader && item.type === "history" && showHistoryHeader && (
              <div className="flex items-center justify-between px-4 pt-2 pb-1">
                <span className="text-xs text-muted-foreground font-medium">搜索历史</span>
                {onClearHistory && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClearHistory(); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>
            )}
            {needsHeader && item.type === "hot" && showHotHeader && (
              <div className="flex items-center gap-1.5 px-4 pt-2 pb-1">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">热搜榜</span>
              </div>
            )}

            {/* 列表项 */}
            <button
              type="button"
              data-index={i}
              onClick={() => onSelect(item)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
                activeIndex === i ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              {/* 图标 */}
              {item.type === "history" && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
              {(item.type === "search" || item.type === "tag" || item.type === "video") && (
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {item.type === "game" && <Gamepad2 className="h-4 w-4 text-muted-foreground shrink-0" />}
              {item.type === "hot" && (
                <span className={cn(
                  "w-5 text-center text-xs font-bold shrink-0",
                  (item.index ?? 0) < 3 ? "text-primary" : "text-muted-foreground"
                )}>
                  {(item.index ?? 0) + 1}
                </span>
              )}

              {/* 文本 */}
              <span className="flex-1 truncate">
                {item.type === "tag" ? `#${item.label}` : item.label}
              </span>

              {/* 右侧操作 */}
              {item.type === "history" && onRemoveHistory && (
                <X
                  className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground shrink-0 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onRemoveHistory(item.value); }}
                />
              )}
              {item.type === "hot" && item.isHot && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium shrink-0">
                  热
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Header({ onMenuClick }: HeaderProps) {
  const { session, isLoading: sessionLoading } = useStableSession();
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Zustand 搜索历史
  const { history: searchHistory, addSearch, removeSearch, clearHistory } = useSearchHistoryStore();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mounted = useIsMounted();
  const router = useRouter();

  const isLoading = !mounted || sessionLoading;

  // 防抖搜索
  const debouncedQuery = useDebounce(searchQuery, 300);

  // 获取搜索建议
  const { data: suggestions } = trpc.video.searchSuggestions.useQuery(
    { query: debouncedQuery, limit: 8 },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 60000,
    }
  );

  // 获取热搜
  const { data: hotSearches } = trpc.video.getHotSearches.useQuery(
    { limit: 8 },
    { staleTime: 300000 }
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

  const handleSearch = useCallback((query: string) => {
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
  }, [router, recordSearchMutation, addSearch]);

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

  const handleSuggestionSelect = useCallback((item: SuggestionItem) => {
    setShowSuggestions(false);
    setShowMobileSearch(false);
    setActiveIndex(-1);

    switch (item.type) {
      case "search":
      case "history":
      case "hot":
        handleSearch(item.value);
        break;
      case "tag":
        setSearchQuery("");
        router.push(`/video/tag/${item.value}`);
        break;
      case "video":
        setSearchQuery("");
        router.push(`/video/${item.value}`);
        break;
      case "game":
        setSearchQuery("");
        router.push(`/game/${item.value}`);
        break;
    }
  }, [handleSearch, router]);

  const handleRemoveHistory = useCallback((query: string) => {
    removeSearch(query);
  }, [removeSearch]);

  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  // ========== 构建统一的建议项列表 ==========
  const buildSuggestionItems = useCallback((): SuggestionItem[] => {
    const items: SuggestionItem[] = [];

    if (debouncedQuery.length >= 1) {
      // 有输入：显示 "搜索 xxx" + 建议
      items.push({
        type: "search",
        label: searchQuery,
        value: searchQuery,
      });

      if (suggestions) {
        // 标签建议
        for (const tag of suggestions.tags) {
          items.push({ type: "tag", label: tag.name, value: tag.slug });
        }
        // 视频建议
        for (const video of suggestions.videos) {
          items.push({ type: "video", label: video.title, value: video.id });
        }
        // 游戏建议
        if (suggestions.games) {
          for (const game of suggestions.games) {
            items.push({ type: "game", label: game.title, value: game.id });
          }
        }
      }
    } else {
      // 无输入：显示搜索历史 + 热搜
      for (const h of searchHistory.slice(0, 8)) {
        items.push({ type: "history", label: h, value: h });
      }

      if (hotSearches) {
        for (let i = 0; i < hotSearches.length; i++) {
          items.push({
            type: "hot",
            label: hotSearches[i].keyword,
            value: hotSearches[i].keyword,
            index: i,
            isHot: hotSearches[i].isHot,
          });
        }
      }
    }

    return items;
  }, [debouncedQuery, searchQuery, suggestions, searchHistory, hotSearches]);

  const suggestionItems = buildSuggestionItems();
  const hasSuggestionItems = suggestionItems.length > 0;
  const hasHistoryItems = suggestionItems.some((i) => i.type === "history");
  const hasHotItems = suggestionItems.some((i) => i.type === "hot");

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [hasSuggestionItems, suggestionItems.length]);

  // activeIndex 在搜索输入变化时通过 handleSearchChange 重置

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-background">
        <div className="flex h-14 items-center">
          {/* Left: Menu + Logo */}
          <div className="flex items-center shrink-0 h-full px-2 md:px-4">
            {/* Desktop Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex h-10 w-10 rounded-full shrink-0"
              onClick={onMenuClick}
              aria-label="切换侧边栏"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full" aria-label="打开菜单">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b px-4 py-4">
                  <SheetTitle>
                    <Link 
                      href="/" 
                      className="flex items-center gap-1 font-bold text-xl"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="text-gradient-anime">Miki</span>
                      <span>acg</span>
                    </Link>
                  </SheetTitle>
                </SheetHeader>
                <MobileSidebarContent onClose={() => setMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <Link href="/" className="flex items-center ml-1">
              <Image
                src="/Mikiacg-logo.webp"
                alt="Mikiacg"
                width={108}
                height={28}
                className="h-7 w-auto"
                priority
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
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={handleKeyDown}
                      className="h-10 rounded-l-full rounded-r-none border border-r-0 pl-4 pr-3 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary"
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
                {showSuggestions && hasSuggestionItems && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 bg-background border rounded-2xl shadow-xl z-50 overflow-hidden max-h-[420px] overflow-y-auto"
                  >
                    <SearchSuggestionsList
                      items={suggestionItems}
                      activeIndex={activeIndex}
                      onSelect={handleSuggestionSelect}
                      onRemoveHistory={handleRemoveHistory}
                      onClearHistory={handleClearHistory}
                      showHistoryHeader={hasHistoryItems}
                      showHotHeader={hasHotItems}
                    />
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
              onClick={() => setShowMobileSearch(true)}
              aria-label="搜索"
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* 主题三选：跟随系统 / 浅色 / 深色 */}
            <div className="hidden sm:flex items-center h-8 rounded-full bg-muted/60 p-0.5 gap-0.5">
              {([
                { value: "system", icon: Monitor, label: "跟随系统" },
                { value: "light", icon: Sun, label: "浅色" },
                { value: "dark", icon: Moon, label: "深色" },
              ] as const).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-label={label}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-full transition-colors",
                    mounted && theme === value
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            {/* 移动端：单按钮循环切换 */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden h-9 w-9 rounded-full"
              onClick={() => {
                const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
                setTheme(next);
              }}
              aria-label="切换主题"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>

            {isLoading ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ) : session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="relative h-8 w-8 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ml-1"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={session.user.image || undefined}
                        alt={session.user.name || ""}
                      />
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
                        <AvatarFallback>
                          {session.user.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col space-y-0.5 leading-none min-w-0">
                        <p className="font-medium truncate">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {session.user.email}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <User className="mr-2 h-4 w-4" />
                      个人设置
                    </Link>
                  </DropdownMenuItem>
                  {session.user?.canUpload && (
                    <DropdownMenuItem asChild>
                      <Link href="/my-videos">
                        <Video className="mr-2 h-4 w-4" />
                        我的视频
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
                    <Link href="/dashboard">
                      <Shield className="mr-2 h-4 w-4" />
                      管理面板
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <AccountSwitcher />
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" asChild className="rounded-full px-3">
                  <Link href="/login">
                    <LogIn className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">登录</span>
                  </Link>
                </Button>
                <Button size="sm" asChild className="rounded-full px-3">
                  <Link href="/register">
                    <UserPlus className="h-4 w-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">注册</span>
                  </Link>
                </Button>
              </div>
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
              onClick={() => { setShowMobileSearch(false); setSearchQuery(""); setActiveIndex(-1); }}
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
                className="flex-1 rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
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
            {hasSuggestionItems ? (
              <SearchSuggestionsList
                items={suggestionItems}
                activeIndex={activeIndex}
                onSelect={handleSuggestionSelect}
                onRemoveHistory={handleRemoveHistory}
                onClearHistory={handleClearHistory}
                showHistoryHeader={hasHistoryItems}
                showHotHeader={hasHotItems}
              />
            ) : searchQuery.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">输入关键词开始搜索</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Search className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">搜索视频、游戏、标签...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
