"use client";

import { trpc } from "@/lib/trpc";
import { GameGrid } from "@/components/game/game-grid";
import type { GameCardData } from "@/components/game/game-card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Gamepad2 } from "lucide-react";
import { PageWrapper, FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { useUIStore } from "@/stores/app";

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

type SortBy = "latest" | "views" | "likes";

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface TypeStat {
  type: string;
  count: number;
}

interface GameListClientProps {
  initialTags: Tag[];
  initialGames: GameCardData[];
  typeStats: TypeStat[];
}

export function GameListClient({ initialTags, initialGames, typeStats }: GameListClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);

  // 记录用户访问了游戏区
  useEffect(() => {
    setContentMode("game");
  }, [setContentMode]);

  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: gameData,
    isLoading,
  } = trpc.game.list.useQuery(
    {
      limit: 20,
      page,
      sortBy,
      tagId: selectedTag || undefined,
      gameType: selectedType || undefined,
    },
    {
      placeholderData: (prev) => prev,
    }
  );

  const games = useMemo(
    () => gameData?.games ?? (page === 1 && sortBy === "latest" && !selectedTag && !selectedType ? initialGames : []),
    [gameData?.games, page, sortBy, selectedTag, selectedType, initialGames]
  );
  const totalPages = gameData?.totalPages ?? 1;

  // 标签栏滚动箭头
  const checkScrollArrows = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  useEffect(() => {
    checkScrollArrows();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollArrows);
      window.addEventListener("resize", checkScrollArrows);
      return () => {
        container.removeEventListener("scroll", checkScrollArrows);
        window.removeEventListener("resize", checkScrollArrows);
      };
    }
  }, [initialTags]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction === "left" ? -200 : 200,
      behavior: "smooth",
    });
  };

  const sortOptions: { id: SortBy; label: string }[] = [
    { id: "latest", label: "最新" },
    { id: "views", label: "热门" },
    { id: "likes", label: "高赞" },
  ];

  const handleSortClick = (id: SortBy) => {
    setSortBy(id);
    setPage(1);
  };

  const handleTagClick = (tagId: string) => {
    setSelectedTag(selectedTag === tagId ? null : tagId);
    setPage(1);
  };

  const handleTypeClick = (type: string) => {
    setSelectedType(type);
    setPage(1);
  };

  // 根据 typeStats 过滤有数据的类型
  const availableTypes = useMemo(() => {
    const typeSet = new Set(typeStats.map((s) => s.type));
    return GAME_TYPE_OPTIONS.filter((opt) => opt.id === "" || typeSet.has(opt.id));
  }, [typeStats]);

  return (
    <PageWrapper>
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        {/* 页面标题 */}
        <FadeIn delay={0.05}>
          <div className="flex items-center gap-3 mb-4">
            <Gamepad2 className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">游戏</h1>
          </div>
        </FadeIn>

        {/* 游戏类型筛选条 */}
        <FadeIn delay={0.1}>
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
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {opt.label}
                  {stat && <span className="ml-1 text-xs opacity-70">({stat.count})</span>}
                </button>
              );
            })}
          </div>
        </FadeIn>

        {/* 排序 + 标签横向滚动条 */}
        <FadeIn delay={0.15}>
          <div className="relative mb-6 overflow-hidden">
            {showLeftArrow && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("left")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div
              ref={scrollContainerRef}
              className="flex gap-2 overflow-x-auto scrollbar-none scroll-smooth px-1 py-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* 排序按钮 */}
              {sortOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSortClick(option.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    sortBy === option.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}

              {/* 分隔线 */}
              {initialTags.length > 0 && (
                <div className="shrink-0 w-px bg-border my-1" />
              )}

              {/* 标签 */}
              {initialTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleTagClick(tag.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    selectedTag === tag.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>

            {showRightArrow && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("right")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </FadeIn>

        {/* 游戏网格 */}
        <section>
          <div key={`${sortBy}-${selectedTag}-${selectedType}-${page}`}>
            {isLoading && games.length === 0 ? (
              <GameGrid games={[]} isLoading />
            ) : (
              <GameGrid games={games} isLoading={false} />
            )}

            {!isLoading && games.length === 0 && (
              <div className="text-center py-16">
                <div className="text-muted-foreground mb-4">
                  <Gamepad2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">没有找到游戏</p>
                  <p className="text-sm mt-1">
                    {selectedTag || selectedType ? "尝试调整筛选条件" : "暂无游戏内容"}
                  </p>
                </div>
                {(selectedTag || selectedType) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedTag(null);
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

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            className="mt-8"
          />
        </section>
      </div>
    </PageWrapper>
  );
}
