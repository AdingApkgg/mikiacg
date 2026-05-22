"use client";

import { trpc } from "@/lib/trpc";
import { GameGrid } from "@/components/game/game-grid";
import { GameCard, type GameCardData } from "@/components/game/game-card";
import Link from "next/link";
import { AnnouncementBanner } from "@/components/shared/announcement-banner";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { usePageParam } from "@/hooks/use-page-param";
import { Gamepad2 } from "lucide-react";
import { MotionPage } from "@/components/motion";
import { cn } from "@/lib/utils";
import { SectionTabs, type SectionTabItem } from "@/components/shared/section-tabs";
import { useTagFilter } from "@/hooks/use-tag-filter";
import { Pagination } from "@/components/ui/pagination";
import { AdCard } from "@/components/ads/ad-card";
import { HeaderBannerCarousel } from "@/components/ads/header-banner";
import { useInlineAds } from "@/hooks/use-inline-ads";
import type { Ad } from "@/lib/ads";
import { useUIStore } from "@/stores/app";
import { useSiteConfig } from "@/contexts/site-config";

/** 分区页主网格固定列数：移动 2 / lg 3 / xl 4 */
const SECTION_GRID_CLASS = "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
/** inline 广告密度：每 8 条插入 1 条 */
const AD_DENSITY = 8;

/** 游戏类型选项 */
const GAME_TYPE_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "全部" },
  { id: "SLG", label: "SLG" },
  { id: "RPG", label: "RPG" },
  { id: "ADV", label: "ADV" },
  { id: "ACT", label: "ACT" },
  { id: "AVG", label: "AVG" },
  { id: "STG", label: "STG" },
  { id: "PZL", label: "PZL" },
  { id: "FTG", label: "FTG" },
  { id: "OTHER", label: "其他" },
];

type SortBy = "latest" | "views" | "likes" | "titleAsc" | "titleDesc";

const ALL_SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "latest", label: "最新" },
  { id: "views", label: "热门" },
  { id: "likes", label: "高赞" },
  { id: "titleAsc", label: "标题 A→Z" },
  { id: "titleDesc", label: "标题 Z→A" },
];

interface TypeStat {
  type: string;
  count: number;
}

interface GameListClientProps {
  initialGames: GameCardData[];
  initialSortBy?: string;
  typeStats: TypeStat[];
  siteConfig: {
    announcement: string | null;
    announcementEnabled: boolean;
  } | null;
  /** 服务端预选的广告（首页第一页 SSR 直出用） */
  initialAds?: Ad[];
}

export function GameListClient({
  initialGames,
  initialSortBy,
  typeStats,
  siteConfig,
  initialAds = [],
}: GameListClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);
  const siteConfigCtx = useSiteConfig();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL ?originalAuthor=xxx 用作"按原作者筛选"，由作者卡片点击时设置
  const originalAuthorFilter = searchParams.get("originalAuthor") || "";

  // 记录用户访问了游戏区
  useEffect(() => {
    setContentMode("game");
  }, [setContentMode]);

  // URL ?sortBy 优先级最高（来自首页 section "查看更多" 链接）
  const urlSortBy = searchParams.get("sortBy") as SortBy | null;
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const enabled = (siteConfigCtx?.gameSortOptions ?? "latest,views,likes").split(",").map((s) => s.trim());
    if (urlSortBy && enabled.includes(urlSortBy)) return urlSortBy;
    const configured = (siteConfigCtx?.gameDefaultSort as SortBy) || "latest";
    return enabled.includes(configured) ? configured : ((enabled[0] as SortBy) ?? "latest");
  });
  const urlTimeRangeRaw = searchParams.get("timeRange");
  const urlTimeRange = (urlTimeRangeRaw as "all" | "today" | "week" | "month" | null) ?? "all";
  const timeRange: "all" | "today" | "week" | "month" = ["all", "today", "week", "month"].includes(urlTimeRange)
    ? urlTimeRange
    : "all";
  const { selectedSlugs, excludedSlugs, clearAll, hasFilter } = useTagFilter();
  const [selectedType, setSelectedType] = useState<string>("");
  const [viewMode, setViewMode] = useState<"games" | "authors">("games");
  const [page, setPage] = usePageParam();
  const [authorsPage, setAuthorsPage] = usePageParam("ap");

  const {
    data: gameData,
    isLoading,
    isFetching,
    isPlaceholderData = false,
  } = trpc.game.list.useQuery(
    {
      limit: 20,
      page,
      sortBy,
      tagSlugs: selectedSlugs.length > 0 ? selectedSlugs : undefined,
      excludeTagSlugs: excludedSlugs.length > 0 ? excludedSlugs : undefined,
      gameType: selectedType || undefined,
      timeRange,
      originalAuthor: originalAuthorFilter || undefined,
    },
    {
      enabled: viewMode === "games",
    },
  );

  // 原作者聚合查询：「作者」tab 用，按 extraInfo.originalAuthor 分组
  const { data: authorsData, isLoading: authorsLoading } = trpc.game.listAuthors.useQuery(
    { limit: 12, page: authorsPage, sortBy: "gameCount" },
    {
      enabled: viewMode === "authors",
    },
  );
  const authorItems = authorsData?.items ?? [];
  const authorsTotalPages = authorsData?.totalPages ?? 1;

  const canUseInitialGames =
    page === 1 &&
    !hasFilter &&
    !selectedType &&
    !originalAuthorFilter &&
    timeRange === "all" &&
    sortBy === (initialSortBy ?? siteConfigCtx?.gameDefaultSort ?? "latest");

  const currentGameData = isPlaceholderData ? undefined : gameData;
  const games = useMemo(
    () => currentGameData?.games ?? (canUseInitialGames ? initialGames : []),
    [currentGameData?.games, canUseInitialGames, initialGames],
  );
  const totalPages = currentGameData?.totalPages ?? 1;
  const gamePending = isLoading || isFetching || isPlaceholderData;
  const showGameSkeleton = gamePending && games.length === 0;

  // 当前页游戏的收藏状态（已登录才查；未登录返回空）
  const gameIds = useMemo(() => games.map((g) => g.id), [games]);
  const { data: favoritedData } = trpc.game.favoritedMap.useQuery(
    { gameIds },
    { enabled: gameIds.length > 0, staleTime: 30_000 },
  );
  const favoritedSet = useMemo(() => new Set(favoritedData?.favoritedIds ?? []), [favoritedData?.favoritedIds]);

  const isFirstPage = page === 1 && !hasFilter && selectedType === "";
  const adSeed = `game-${page}-${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}-${selectedType}`;
  const { gridItems, pickedAds, hasAds } = useInlineAds({
    items: games,
    seed: adSeed,
    initialAds,
    useInitialAds: isFirstPage && initialAds.length > 0,
    count: 4,
    interval: AD_DENSITY,
  });

  const sortOptions = useMemo(() => {
    const enabledKeys = (siteConfigCtx?.gameSortOptions ?? "latest,views,likes").split(",").map((s) => s.trim());
    return ALL_SORT_OPTIONS.filter((opt) => enabledKeys.includes(opt.id));
  }, [siteConfigCtx?.gameSortOptions]);

  /** 切换"作品/作者"视图。切到 authors 时清空 tag 与 originalAuthor URL 参数 */
  const handleViewModeClick = useCallback(
    (mode: "games" | "authors") => {
      setViewMode(mode);
      if (mode === "authors") {
        clearAll();
        setSelectedType("");
        if (originalAuthorFilter) {
          const params = new URLSearchParams(window.location.search);
          params.delete("originalAuthor");
          const qs = params.toString();
          router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
        }
      }
    },
    [clearAll, originalAuthorFilter, pathname, router],
  );

  /** 清除"按原作者筛选" */
  const handleClearAuthorFilter = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete("originalAuthor");
    params.delete("page");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [pathname, router]);

  const handleSortClick = useCallback(
    (id: SortBy) => {
      setSortBy(id);
      setPage(1);
    },
    [setPage],
  );

  const handleTypeClick = useCallback(
    (type: string) => {
      setSelectedType(type);
      setPage(1);
    },
    [setPage],
  );

  // 根据 typeStats 过滤有数据的类型
  const availableTypes = useMemo(() => {
    const typeSet = new Set(typeStats.map((s) => s.type));
    return GAME_TYPE_OPTIONS.filter((opt) => opt.id === "" || typeSet.has(opt.id));
  }, [typeStats]);
  const showGameTypeFilter = viewMode === "games" && availableTypes.length > 1;

  return (
    <MotionPage direction="none">
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        <HeaderBannerCarousel className="mb-4" />
        <AnnouncementBanner
          enabled={siteConfig?.announcementEnabled ?? false}
          announcement={siteConfig?.announcement ?? null}
        />
        {showGameTypeFilter && (
          <MotionPage>
            <div className="flex flex-wrap gap-2 mb-4">
              {availableTypes.map((opt) => {
                const stat = typeStats.find((s) => s.type === opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleTypeClick(opt.id)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                      selectedType === opt.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80 text-foreground",
                    )}
                  >
                    {opt.label}
                    {stat && <span className="ml-1 text-xs opacity-70">({stat.count})</span>}
                  </button>
                );
              })}
            </div>
          </MotionPage>
        )}

        <MotionPage>
          {sortOptions.length > 0 && (
            <SectionTabs<SortBy>
              className="mb-3"
              tabs={sortOptions as SectionTabItem<SortBy>[]}
              value={sortBy}
              onChange={handleSortClick}
              trailing={
                <div className="flex items-center gap-1 rounded-full bg-muted/60 p-0.5">
                  {(["games", "authors"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleViewModeClick(mode)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-full transition-colors",
                        viewMode === mode
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {mode === "games" ? "作品" : "作者"}
                    </button>
                  ))}
                </div>
              }
            />
          )}

          {/* 当前正在按某位原作者筛选时显示横幅 */}
          {viewMode === "games" && originalAuthorFilter && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl bg-primary/8 border border-primary/20 px-4 py-2.5">
              <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate">
                正在按原作者筛选：<strong className="font-semibold">{originalAuthorFilter}</strong>
              </span>
              <button
                type="button"
                onClick={handleClearAuthorFilter}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
              >
                清除
              </button>
            </div>
          )}
        </MotionPage>

        <section>
          {viewMode === "authors" ? (
            <GameAuthorsGrid
              items={authorItems}
              isLoading={authorsLoading}
              page={authorsPage}
              totalPages={authorsTotalPages}
              onPageChange={setAuthorsPage}
              onAuthorClick={() => setViewMode("games")}
            />
          ) : (
            <div
              key={`${sortBy}-${selectedSlugs.join(",")}-${excludedSlugs.join(",")}-${selectedType}-${page}-${originalAuthorFilter}`}
            >
              {showGameSkeleton ? (
                <GameGrid games={[]} isLoading columnsClass={SECTION_GRID_CLASS} />
              ) : hasAds ? (
                <div className={cn("grid gap-3 sm:gap-4 lg:gap-5", SECTION_GRID_CLASS)}>
                  {gridItems.map((item, index) =>
                    item.type === "ad" ? (
                      <AdCard key={`ad-${item.adIndex}`} ad={pickedAds[item.adIndex]} slotId="in-feed" />
                    ) : (
                      <GameCard
                        key={item.data.id}
                        game={item.data}
                        index={index}
                        isFavorited={favoritedSet.has(item.data.id)}
                      />
                    ),
                  )}
                </div>
              ) : (
                <GameGrid
                  games={games}
                  isLoading={false}
                  columnsClass={SECTION_GRID_CLASS}
                  favoritedSet={favoritedSet}
                />
              )}

              {!gamePending && games.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-muted-foreground mb-4">
                    <Gamepad2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">没有找到游戏</p>
                    <p className="text-sm mt-1">{hasFilter || selectedType ? "尝试调整筛选条件" : "暂无游戏内容"}</p>
                  </div>
                  {(hasFilter || selectedType) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        clearAll();
                        setSelectedType("");
                      }}
                      className="mt-4"
                    >
                      清除筛选
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {viewMode === "games" && (
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} className="mt-8" />
          )}
        </section>
      </div>
    </MotionPage>
  );
}

interface AuthorItem {
  author: string;
  gameCount: number;
  totalViews: number;
  previewGames: { id: string; coverUrl: string | null; title: string }[];
}

/** 「作者」tab 的原作者卡片网格：参考视频区，带分页 + 2x2 预览封面 */
function GameAuthorsGrid({
  items,
  isLoading,
  page,
  totalPages,
  onPageChange,
  onAuthorClick,
}: {
  items: AuthorItem[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (n: number) => void;
  onAuthorClick: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading && items.length === 0
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-video w-full rounded-2xl bg-muted animate-pulse" />
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            ))
          : items.map((a) => (
              <Link
                key={a.author}
                href={`/game?originalAuthor=${encodeURIComponent(a.author)}`}
                onClick={onAuthorClick}
                className="group block"
              >
                <div className="overflow-hidden rounded-2xl bg-card border shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                  <div className="relative aspect-video bg-muted">
                    {a.previewGames.length > 0 ? (
                      <div className="grid grid-cols-2 grid-rows-2 h-full">
                        {[0, 1, 2, 3].map((idx) => {
                          const g = a.previewGames[idx];
                          return (
                            <div key={idx} className="relative overflow-hidden">
                              {g?.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={g.coverUrl} alt={g.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center">
                                  <Gamepad2 className="w-6 h-6 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gamepad2 className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                      {a.gameCount} 个作品
                    </span>
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium line-clamp-1 group-hover:text-primary transition-colors">{a.author}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span>{a.gameCount} 个作品</span>
                      <span>·</span>
                      <span>{a.totalViews.toLocaleString()} 播放</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
      </div>

      {!isLoading && items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">暂无原作者数据</p>
          <p className="text-sm mt-1">投稿时填写「原作者」后，将自动出现在此</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} className="mt-8" />
    </>
  );
}
