"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { PageWrapper, FadeIn } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GameCard } from "@/components/game/game-card";
import {
  Gamepad2, ThumbsUp, ThumbsDown, Heart, Eye, Download,
  Calendar, User, ExternalLink, Copy, Check, Info, Image as ImageIcon,
  Users, FileText, ChevronLeft, Lock, Monitor, Smartphone, Play,
} from "lucide-react";
import { GameVideoPlayer } from "@/components/game/game-video-player";
import { formatViews, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SerializedGame } from "./page";
import type { GameExtraInfo } from "./page";

/** 游戏类型标签颜色 */
const GAME_TYPE_COLORS: Record<string, string> = {
  ADV: "bg-blue-500 text-white",
  SLG: "bg-purple-500 text-white",
  RPG: "bg-green-500 text-white",
  ACT: "bg-red-500 text-white",
  STG: "bg-orange-500 text-white",
  PZL: "bg-cyan-500 text-white",
  AVG: "bg-indigo-500 text-white",
  FTG: "bg-rose-500 text-white",
  TAB: "bg-amber-500 text-white",
  OTHER: "bg-gray-500 text-white",
};

interface GamePageClientProps {
  id: string;
  initialGame: SerializedGame;
}

export function GamePageClient({ id, initialGame }: GamePageClientProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const extra: GameExtraInfo = (initialGame.extraInfo && typeof initialGame.extraInfo === "object")
    ? initialGame.extraInfo as GameExtraInfo
    : {};

  // 获取相关游戏
  const { data: relatedGames } = trpc.game.getRelated.useQuery(
    { gameId: id, limit: 6 },
    { enabled: !!id }
  );

  // 用户交互状态
  const { data: interaction } = trpc.game.getUserInteraction.useQuery(
    { gameId: id },
    { enabled: !!id }
  );

  const toggleReaction = trpc.game.toggleReaction.useMutation();
  const toggleFavorite = trpc.game.toggleFavorite.useMutation();

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const authorName = extra.originalAuthor || initialGame.uploader.nickname || initialGame.uploader.username;

  // 截图和视频分别来自独立字段
  const imageUrls = extra.screenshots ?? [];
  const videoUrls = extra.videos ?? [];

  // 判断有哪些标签页有内容
  const hasScreenshots = imageUrls.length > 0;
  const hasVideos = videoUrls.length > 0;
  const hasDescription = !!initialGame.description;
  const hasCharacterIntro = !!extra.characterIntro;
  const hasDownloads = extra.downloads && extra.downloads.length > 0;
  const hasGameInfo = extra.originalName || extra.originalAuthor || extra.authorUrl || extra.fileSize || extra.platforms;

  // 默认标签页
  const defaultTab = hasDescription ? "intro" : hasVideos ? "videos" : hasScreenshots ? "screenshots" : "info";

  return (
    <PageWrapper>
      <div className="px-4 md:px-6 py-4 max-w-6xl mx-auto">
        {/* 返回按钮 */}
        <FadeIn delay={0.05}>
          <Link
            href="/game"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ChevronLeft className="h-4 w-4" />
            返回游戏列表
          </Link>
        </FadeIn>

        {/* 头部：封面 + 基本信息 */}
        <FadeIn delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] gap-6 mb-8">
            {/* 左侧：封面 */}
            <div className="mx-auto md:mx-0 w-full max-w-[320px]">
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-muted shadow-lg">
                {initialGame.coverUrl ? (
                  <Image
                    src={
                      initialGame.coverUrl.startsWith("/uploads/")
                        ? initialGame.coverUrl
                        : `/api/cover/${encodeURIComponent(initialGame.coverUrl)}`
                    }
                    alt={initialGame.title}
                    fill
                    className="object-cover"
                    sizes="320px"
                    priority
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
                    <Gamepad2 className="h-16 w-16 text-muted-foreground/40" />
                  </div>
                )}

                {/* 游戏类型 Badge */}
                {initialGame.gameType && (
                  <Badge
                    className={cn(
                      "absolute top-3 left-3 text-xs font-bold border-0",
                      GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER
                    )}
                  >
                    {initialGame.gameType}
                  </Badge>
                )}

                {/* 免费标记 */}
                {initialGame.isFree && (
                  <Badge className="absolute top-3 right-3 bg-green-500 text-white text-xs border-0 hover:bg-green-500">
                    免费
                  </Badge>
                )}
              </div>
            </div>

            {/* 右侧：游戏信息 */}
            <div className="space-y-4">
              {/* 标题 */}
              <h1 className="text-2xl lg:text-3xl font-bold leading-tight">
                {initialGame.title}
              </h1>

              {/* 版本号 */}
              {initialGame.version && (
                <Badge variant="outline" className="text-xs">
                  {initialGame.version}
                </Badge>
              )}

              {/* 作者 + 日期 */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {authorName}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatDate(initialGame.createdAt, "YYYY-MM-DD")}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye className="h-4 w-4" />
                  {formatViews(initialGame.views)} 次浏览
                </span>
              </div>

              {/* 标签 */}
              {initialGame.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {initialGame.tags.map(({ tag }) => (
                    <Link key={tag.id} href={`/game/tag/${tag.slug}`}>
                      <Badge
                        variant="secondary"
                        className="text-xs hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                      >
                        {tag.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              {/* 平台信息 */}
              {extra.platforms && extra.platforms.length > 0 && (
                <div className="flex items-center gap-2">
                  {extra.platforms.map((platform) => (
                    <Badge key={platform} variant="outline" className="gap-1 text-xs">
                      {platform.toLowerCase().includes("android") ? (
                        <Smartphone className="h-3 w-3" />
                      ) : (
                        <Monitor className="h-3 w-3" />
                      )}
                      {platform}
                    </Badge>
                  ))}
                </div>
              )}

              {/* 文件大小 */}
              {extra.fileSize && (
                <p className="text-sm text-muted-foreground">
                  文件大小：{extra.fileSize}
                </p>
              )}

              {/* 互动按钮 */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant={interaction?.liked ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => toggleReaction.mutate({ gameId: id, type: "like" })}
                >
                  <ThumbsUp className="h-4 w-4" />
                  赞 {initialGame._count.likes > 0 && `(${initialGame._count.likes})`}
                </Button>
                <Button
                  variant={interaction?.disliked ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => toggleReaction.mutate({ gameId: id, type: "dislike" })}
                >
                  <ThumbsDown className="h-4 w-4" />
                  踩 {initialGame._count.dislikes > 0 && `(${initialGame._count.dislikes})`}
                </Button>
                <Button
                  variant={interaction?.favorited ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => toggleFavorite.mutate({ gameId: id })}
                >
                  <Heart className={cn("h-4 w-4", interaction?.favorited && "fill-current")} />
                  收藏 {initialGame._count.favorites > 0 && `(${initialGame._count.favorites})`}
                </Button>
              </div>

              {/* 下载按钮（大按钮） */}
              {hasDownloads && (
                <div className="pt-2">
                  <Button size="lg" className="gap-2 w-full sm:w-auto" asChild>
                    <a href="#downloads">
                      <Download className="h-5 w-5" />
                      游戏下载
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </FadeIn>

        {/* 公告/提示 */}
        {extra.notices && extra.notices.length > 0 && (
          <FadeIn delay={0.15}>
            <div className="space-y-2 mb-6">
              {extra.notices.map((notice, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg px-4 py-3 text-sm flex items-start gap-2",
                    notice.type === "warning" && "bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400",
                    notice.type === "error" && "bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400",
                    notice.type === "success" && "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400",
                    notice.type === "info" && "bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400",
                  )}
                >
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  {notice.content}
                </div>
              ))}
            </div>
          </FadeIn>
        )}

        {/* 标签页内容区域 */}
        <FadeIn delay={0.2}>
          <Tabs defaultValue={defaultTab} className="mb-8">
            <TabsList variant="line" className="w-full justify-start border-b pb-0">
              {hasDescription && (
                <TabsTrigger value="intro" className="gap-1.5">
                  <FileText className="h-4 w-4" />
                  游戏介绍
                </TabsTrigger>
              )}
              {hasVideos && (
                <TabsTrigger value="videos" className="gap-1.5">
                  <Play className="h-4 w-4" />
                  游戏视频
                </TabsTrigger>
              )}
              {hasScreenshots && (
                <TabsTrigger value="screenshots" className="gap-1.5">
                  <ImageIcon className="h-4 w-4" />
                  游戏截图
                </TabsTrigger>
              )}
              {hasCharacterIntro && (
                <TabsTrigger value="characters" className="gap-1.5">
                  <Users className="h-4 w-4" />
                  角色介绍
                </TabsTrigger>
              )}
              {hasGameInfo && (
                <TabsTrigger value="info" className="gap-1.5">
                  <Info className="h-4 w-4" />
                  游戏信息
                </TabsTrigger>
              )}
            </TabsList>

            {/* 游戏介绍 */}
            {hasDescription && (
              <TabsContent value="intro" className="pt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      {initialGame.description}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* 游戏视频 */}
            {hasVideos && (
              <TabsContent value="videos" className="pt-4">
                <div className="grid grid-cols-1 gap-4">
                  {videoUrls.map((url, i) => (
                    <div key={i} className="rounded-lg overflow-hidden bg-black">
                      <GameVideoPlayer
                        src={url}
                        className="w-full aspect-video"
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            {/* 游戏截图 */}
            {hasScreenshots && (
              <TabsContent value="screenshots" className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {imageUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-video rounded-lg overflow-hidden bg-muted group"
                    >
                      <Image
                        src={url}
                        alt={`${initialGame.title} 截图 ${i + 1}`}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, 50vw"
                        unoptimized
                      />
                    </a>
                  ))}
                </div>
              </TabsContent>
            )}

            {/* 角色介绍 */}
            {hasCharacterIntro && (
              <TabsContent value="characters" className="pt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                      {extra.characterIntro}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* 游戏信息 */}
            {hasGameInfo && (
              <TabsContent value="info" className="pt-4">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <dl className="space-y-3">
                      {extra.originalName && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">游戏原名</dt>
                          <dd className="text-sm">{extra.originalName}</dd>
                        </div>
                      )}
                      {extra.originalAuthor && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">原作者</dt>
                          <dd className="text-sm">{extra.originalAuthor}</dd>
                        </div>
                      )}
                      {extra.authorUrl && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">作者网址</dt>
                          <dd className="text-sm">
                            <a
                              href={extra.authorUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              点击进入
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </dd>
                        </div>
                      )}
                      {extra.fileSize && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">文件大小</dt>
                          <dd className="text-sm">{extra.fileSize}</dd>
                        </div>
                      )}
                      {extra.platforms && extra.platforms.length > 0 && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">支持平台</dt>
                          <dd className="text-sm flex gap-1.5">
                            {extra.platforms.map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                          </dd>
                        </div>
                      )}
                      {initialGame.gameType && (
                        <div className="flex flex-col sm:flex-row sm:gap-4">
                          <dt className="text-sm font-medium text-muted-foreground w-24 shrink-0">游戏类型</dt>
                          <dd className="text-sm">
                            <Badge className={cn("text-xs border-0", GAME_TYPE_COLORS[initialGame.gameType] || GAME_TYPE_COLORS.OTHER)}>
                              {initialGame.gameType}
                            </Badge>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </FadeIn>

        {/* 下载区域 */}
        {hasDownloads && (
          <FadeIn delay={0.25}>
            <div id="downloads" className="mb-8 scroll-mt-20">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Download className="h-5 w-5" />
                游戏下载
              </h2>
              <div className="space-y-3">
                {extra.downloads!.map((dl, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{dl.name}</p>
                        {dl.password && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" />
                            解压密码：
                            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                              {dl.password}
                            </code>
                            <button
                              onClick={() => handleCopyUrl(dl.password!)}
                              className="text-primary hover:text-primary/80 transition-colors"
                            >
                              {copiedUrl === dl.password ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <Button size="sm" className="gap-1.5 shrink-0" asChild>
                        <a href={dl.url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                          下载
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </FadeIn>
        )}

        {/* 相关推荐 */}
        {relatedGames && relatedGames.length > 0 && (
          <FadeIn delay={0.3}>
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-4">相关推荐</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                {relatedGames.map((game, index) => (
                  <GameCard
                    key={game.id}
                    game={{
                      ...game,
                      createdAt: game.createdAt.toString(),
                    }}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}

        {/* 评论区预留 */}
        <FadeIn delay={0.35}>
          <Card className="mb-8">
            <CardContent className="p-6 text-center text-muted-foreground">
              <p className="text-sm">评论功能即将上线</p>
            </CardContent>
          </Card>
        </FadeIn>
      </div>
    </PageWrapper>
  );
}
