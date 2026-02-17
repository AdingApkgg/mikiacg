"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  Tags,
  TrendingUp,
  FileVideo,
  Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VideoTagData {
  id: string;
  name: string;
  slug: string;
  _count: { videos: number };
}

interface GameTagData {
  id: string;
  name: string;
  slug: string;
  _count: { games: number };
}

interface TagsPageClientProps {
  videoPopularTags: VideoTagData[];
  videoAllTags: VideoTagData[];
  gamePopularTags: GameTagData[];
  gameAllTags: GameTagData[];
}

export function TagsPageClient({
  videoPopularTags,
  videoAllTags,
  gamePopularTags,
  gameAllTags,
}: TagsPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const isSearching = searchQuery.length > 0;
  const lowerQuery = searchQuery.toLowerCase();

  const filteredVideoTags = useMemo(() => {
    if (!isSearching) return videoAllTags;
    return videoAllTags.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  }, [isSearching, lowerQuery, videoAllTags]);

  const filteredGameTags = useMemo(() => {
    if (!isSearching) return gameAllTags;
    return gameAllTags.filter((t) => t.name.toLowerCase().includes(lowerQuery));
  }, [isSearching, lowerQuery, gameAllTags]);

  return (
    <div className="container py-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">标签</h1>
        <span className="text-sm text-muted-foreground">
          视频 {videoAllTags.length} 个 · 游戏 {gameAllTags.length} 个
        </span>
      </div>

      {/* 搜索框 */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜索标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 视频/游戏标签 Tab */}
      <Tabs defaultValue="video" className="space-y-6">
        <TabsList>
          <TabsTrigger value="video" className="gap-1.5">
            <FileVideo className="h-4 w-4" />
            视频标签
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredVideoTags.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="game" className="gap-1.5">
            <Gamepad2 className="h-4 w-4" />
            游戏标签
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredGameTags.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* 视频标签 */}
        <TabsContent value="video" className="space-y-8">
          {!isSearching && videoPopularTags.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">热门视频标签</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {videoPopularTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/video/tag/${tag.slug}`}
                    className="transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    <Badge
                      variant="default"
                      className="text-sm py-1.5 px-3 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {tag.name}
                      <span className="ml-1 opacity-70">
                        ({tag._count.videos})
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Tags className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold">
                {isSearching
                  ? `搜索结果 (${filteredVideoTags.length})`
                  : "所有视频标签"}
              </h2>
            </div>
            <TagList
              tags={filteredVideoTags}
              type="video"
              isSearching={isSearching}
              searchQuery={searchQuery}
            />
          </section>
        </TabsContent>

        {/* 游戏标签 */}
        <TabsContent value="game" className="space-y-8">
          {!isSearching && gamePopularTags.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">热门游戏标签</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {gamePopularTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/game/tag/${tag.slug}`}
                    className="transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    <Badge
                      variant="default"
                      className="text-sm py-1.5 px-3 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {tag.name}
                      <span className="ml-1 opacity-70">
                        ({tag._count.games})
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-4">
              <Tags className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold">
                {isSearching
                  ? `搜索结果 (${filteredGameTags.length})`
                  : "所有游戏标签"}
              </h2>
            </div>
            <TagList
              tags={filteredGameTags}
              type="game"
              isSearching={isSearching}
              searchQuery={searchQuery}
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TagList({
  tags,
  type,
  isSearching,
  searchQuery,
}: {
  tags: (VideoTagData | GameTagData)[];
  type: "video" | "game";
  isSearching: boolean;
  searchQuery: string;
}) {
  const basePath = type === "video" ? "/video/tag" : "/game/tag";

  const getCount = (tag: VideoTagData | GameTagData) => {
    if ("videos" in tag._count) return tag._count.videos;
    if ("games" in tag._count) return tag._count.games;
    return 0;
  };

  if (tags.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          {isSearching
            ? `没有找到包含 "${searchQuery}" 的标签`
            : "暂无标签"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={`${basePath}/${tag.slug}`}
          className="transition-all duration-200 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
        >
          <Badge
            variant="outline"
            className="text-sm py-1.5 px-3 cursor-pointer hover:bg-accent transition-colors"
          >
            {tag.name}
            <span className="ml-1 opacity-70">({getCount(tag)})</span>
          </Badge>
        </Link>
      ))}
    </div>
  );
}
