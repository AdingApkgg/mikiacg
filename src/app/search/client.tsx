"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { GameGrid } from "@/components/game/game-grid";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Search, Clock, TrendingUp, X, Play, Gamepad2 } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useRouter } from "next/navigation";
import { useSearchHistoryStore } from "@/stores/app";
import { cn } from "@/lib/utils";

interface SearchContentProps {
  query: string;
}

type SearchTab = "video" | "game";
type SortBy = "latest" | "views" | "likes";
type TimeRange = "all" | "today" | "week" | "month";

const TAB_OPTIONS: { value: SearchTab; label: string; icon: React.ElementType }[] = [
  { value: "video", label: "视频", icon: Play },
  { value: "game", label: "游戏", icon: Gamepad2 },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "latest", label: "最新" },
  { value: "views", label: "最多播放" },
  { value: "likes", label: "最多点赞" },
];

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
];

// 筛选 Chip 组件
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-foreground text-background"
          : "bg-muted hover:bg-muted/80 text-foreground"
      )}
    >
      {label}
    </button>
  );
}

// 无 query 时的探索页面
function SearchExplore() {
  const router = useRouter();
  const { history: searchHistory, removeSearch, clearHistory } = useSearchHistoryStore();

  const { data: hotSearches } = trpc.video.getHotSearches.useQuery(
    { limit: 10 },
    { staleTime: 300000 }
  );

  const goSearch = (keyword: string) => {
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="px-4 md:px-6 py-6 max-w-3xl mx-auto">
      {/* 搜索历史 */}
      {searchHistory.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              搜索历史
            </h2>
            <button
              onClick={clearHistory}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              全部清除
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchHistory.slice(0, 12).map((keyword) => (
              <button
                key={keyword}
                onClick={() => goSearch(keyword)}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-accent text-sm transition-colors"
              >
                <span>{keyword}</span>
                <X
                  className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                  onClick={(e) => { e.stopPropagation(); removeSearch(keyword); }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 热搜榜 */}
      {hotSearches && hotSearches.length > 0 && (
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4" />
            热搜榜
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {hotSearches.map((item, index) => (
              <button
                key={item.keyword}
                onClick={() => goSearch(item.keyword)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent text-left transition-colors"
              >
                <span
                  className={cn(
                    "w-6 text-center text-sm font-bold",
                    index < 3 ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {index + 1}
                </span>
                <span className="flex-1 text-sm truncate">{item.keyword}</span>
                {item.isHot && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">
                    热
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 完全空状态 */}
      {searchHistory.length === 0 && (!hotSearches || hotSearches.length === 0) && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <h1 className="text-xl font-semibold mt-4">搜索</h1>
          <p className="text-muted-foreground mt-2 text-sm">在顶部搜索框中输入关键词开始搜索视频和游戏</p>
        </div>
      )}
    </div>
  );
}

export function SearchContent({ query }: SearchContentProps) {
  const [searchTab, setSearchTab] = useState<SearchTab>("video");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [videoPage, setVideoPage] = useState(1);
  const [gamePage, setGamePage] = useState(1);

  const page = searchTab === "video" ? videoPage : gamePage;
  const setPage = searchTab === "video" ? setVideoPage : setGamePage;

  // 视频搜索查询
  const {
    data: videoData,
    isLoading: videoLoading,
  } = trpc.video.list.useQuery(
    { limit: 20, page: videoPage, search: query, sortBy, timeRange },
    {
      enabled: !!query && searchTab === "video",
      placeholderData: (prev) => prev,
    }
  );

  // 游戏搜索查询
  const {
    data: gameData,
    isLoading: gameLoading,
  } = trpc.game.list.useQuery(
    { limit: 20, page: gamePage, search: query, sortBy, timeRange },
    {
      enabled: !!query && searchTab === "game",
      placeholderData: (prev) => prev,
    }
  );

  const videos = videoData?.videos ?? [];
  const videoTotalCount = videoData?.totalCount ?? 0;
  const videoTotalPages = videoData?.totalPages ?? 1;

  const games = gameData?.games ?? [];
  const gameTotalCount = gameData?.totalCount ?? 0;
  const gameTotalPages = gameData?.totalPages ?? 1;

  const isLoading = searchTab === "video" ? videoLoading : gameLoading;
  const totalCount = searchTab === "video" ? videoTotalCount : gameTotalCount;
  const totalPages = searchTab === "video" ? videoTotalPages : gameTotalPages;

  // 无搜索词时展示探索页
  if (!query) {
    return <SearchExplore />;
  }

  const handleTabChange = (tab: SearchTab) => {
    setSearchTab(tab);
  };

  return (
    <div className="px-4 md:px-6 py-6">
      {/* 搜索标题 */}
      <div className="mb-4">
        <p className="text-muted-foreground text-sm">
          搜索 &quot;{query}&quot;
          {!isLoading && (
            <span className="ml-1">
              - 共 {totalCount} 个{searchTab === "video" ? "视频" : "游戏"}
            </span>
          )}
        </p>
      </div>

      {/* 视频 / 游戏 标签页切换 */}
      <div className="flex gap-1 mb-4">
        {TAB_OPTIONS.map((tab) => {
          const Icon = tab.icon;
          const isActive = searchTab === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* YouTube 风格的 chip 筛选栏 */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {/* 排序 chips */}
        {SORT_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={sortBy === option.value}
            onClick={() => { setSortBy(option.value); setPage(1); }}
          />
        ))}

        {/* 分隔线 */}
        <div className="w-px bg-border shrink-0 my-1" />

        {/* 时间 chips */}
        {TIME_RANGE_OPTIONS.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            active={timeRange === option.value}
            onClick={() => { setTimeRange(option.value); setPage(1); }}
          />
        ))}
      </div>

      {/* 内容区域 */}
      {searchTab === "video" ? (
        <>
          <VideoGrid videos={videos} isLoading={isLoading} />

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-8"
            />
          )}

          {!isLoading && videos.length === 0 && (
            <div className="text-center py-16">
              <Search className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">没有找到相关视频</p>
              {(sortBy !== "latest" || timeRange !== "all") && (
                <Button
                  variant="link"
                  onClick={() => { setSortBy("latest"); setTimeRange("all"); }}
                  className="mt-2"
                >
                  清除筛选条件重试
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <GameGrid games={games} isLoading={isLoading} columns={4} />

          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-8"
            />
          )}

          {!isLoading && games.length === 0 && (
            <div className="text-center py-16">
              <Gamepad2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">没有找到相关游戏</p>
              {(sortBy !== "latest" || timeRange !== "all") && (
                <Button
                  variant="link"
                  onClick={() => { setSortBy("latest"); setTimeRange("all"); }}
                  className="mt-2"
                >
                  清除筛选条件重试
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
