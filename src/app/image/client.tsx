"use client";

import { trpc } from "@/lib/trpc";
import { ImagePostCard } from "@/components/image/image-post-card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { PageWrapper, FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { useUIStore } from "@/stores/app";

type SortBy = "latest" | "views";

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface ImagePost {
  id: string;
  title: string;
  description?: string | null;
  images: string[];
  views: number;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  tags?: { tag: { id: string; name: string; slug: string } }[];
}

interface ImageListClientProps {
  initialTags: Tag[];
  initialPosts: ImagePost[];
}

export function ImageListClient({ initialTags, initialPosts }: ImageListClientProps) {
  const setContentMode = useUIStore((s) => s.setContentMode);

  useEffect(() => {
    setContentMode("image");
  }, [setContentMode]);

  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: postData,
    isLoading,
  } = trpc.image.list.useQuery(
    {
      limit: 20,
      page,
      sortBy,
      tagId: selectedTag || undefined,
    },
    {
      placeholderData: (prev) => prev,
    }
  );

  const posts = useMemo(
    () => postData?.posts ?? (page === 1 ? initialPosts : []),
    [postData?.posts, page, initialPosts]
  );
  const totalPages = postData?.totalPages ?? 1;

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
  ];

  return (
    <PageWrapper>
      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        {/* Tag bar */}
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
              {sortOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => { setSortBy(option.id); setPage(1); }}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    sortBy === option.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}

              {initialTags.length > 0 && (
                <>
                  <div className="shrink-0 w-px bg-border my-1" />
                  {initialTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => {
                        setSelectedTag(selectedTag === tag.id ? null : tag.id);
                        setPage(1);
                      }}
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
                </>
              )}
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

        {/* Content grid */}
        <section>
          <div key={`${sortBy}-${selectedTag}-${page}`}>
            {isLoading && posts.length === 0 ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                {posts.map((post, index) => (
                  <ImagePostCard key={post.id} post={post} index={index} />
                ))}
              </div>
            )}

            {!isLoading && posts.length === 0 && (
              <div className="text-center py-16">
                <div className="text-muted-foreground mb-4">
                  <Images className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">没有找到图片</p>
                  <p className="text-sm mt-1">
                    {selectedTag ? "尝试选择其他标签" : "暂无图片内容"}
                  </p>
                </div>
                {selectedTag && (
                  <Button variant="outline" onClick={() => setSelectedTag(null)} className="mt-4">
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
