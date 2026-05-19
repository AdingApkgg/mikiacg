"use client";

import { trpc } from "@/lib/trpc";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Play, Clock, Eye, ArrowLeft, User, Download, AlertCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { MotionPage } from "@/components/motion";
import { useVideoCoverThumb } from "@/hooks/use-thumb";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getRedirectUrl } from "@/lib/utils";
import { useRedirectOptions } from "@/hooks/use-redirect-options";

function formatDuration(seconds: number | null) {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SeriesPage() {
  const redirectOpts = useRedirectOptions();
  const params = useParams();
  const seriesId = params.id as string;
  const gridCover = useVideoCoverThumb("gridPrimary");

  const { data: series, isLoading, error } = trpc.series.getById.useQuery({ id: seriesId }, { enabled: !!seriesId });
  const { data: typesData } = trpc.series.listTypes.useQuery(undefined, { staleTime: 5 * 60_000 });
  const seriesTypeInfo = series?.type ? (typesData?.types.find((t) => t.code === series.type) ?? null) : null;

  if (isLoading) {
    return (
      <MotionPage direction="none">
        <div className="container py-6 max-w-6xl">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-4 w-96 mb-6" />
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        </div>
      </MotionPage>
    );
  }

  if (error || !series) {
    return (
      <MotionPage direction="none">
        <div className="container py-6 max-w-6xl">
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">合集不存在或已被删除</p>
            <Button variant="outline" asChild className="mt-4">
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页
              </Link>
            </Button>
          </div>
        </div>
      </MotionPage>
    );
  }

  const publishedEpisodes = series.episodes.filter((ep) => ep.video.status === "PUBLISHED");
  const totalViews = publishedEpisodes.reduce((sum, ep) => sum + ep.video.views, 0);

  return (
    <MotionPage direction="none">
      <div className="container py-6 max-w-6xl">
        {/* 返回按钮 */}
        <MotionPage>
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回首页
            </Link>
          </Button>
        </MotionPage>

        {/* 合集信息 */}
        <MotionPage>
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h1 className="text-2xl font-bold">{series.title}</h1>
              {seriesTypeInfo && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={
                    seriesTypeInfo.color
                      ? { borderColor: seriesTypeInfo.color, color: seriesTypeInfo.color }
                      : undefined
                  }
                >
                  {seriesTypeInfo.label}
                </Badge>
              )}
              {series.brand && (
                <Badge variant="secondary" className="text-xs">
                  {series.brand}
                </Badge>
              )}
            </div>
            {series.description && <p className="text-muted-foreground mb-3">{series.description}</p>}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href={`/user/${series.creator.id}`}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                {series.creator.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={series.creator.avatar}
                    alt={series.creator.nickname || series.creator.username}
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <User className="h-4 w-4" />
                )}
                <span>{series.creator.nickname || series.creator.username}</span>
              </Link>
              <span>·</span>
              <span>{publishedEpisodes.length} 集</span>
              <span>·</span>
              <span>{totalViews.toLocaleString()} 播放</span>
            </div>

            {/* 下载区域 */}
            {series.downloadUrl && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/30 space-y-3">
                {series.downloadNote && (
                  <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-sm whitespace-pre-wrap">{series.downloadNote}</AlertDescription>
                  </Alert>
                )}
                <Button asChild className="w-full sm:w-auto">
                  <a href={getRedirectUrl(series.downloadUrl, redirectOpts)} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    下载资源
                    <ExternalLink className="h-3 w-3 ml-2 opacity-50" />
                  </a>
                </Button>
              </div>
            )}
          </div>
        </MotionPage>

        {/* 剧集列表 */}
        <MotionPage>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {publishedEpisodes.map((episode) => (
              <Link key={episode.video.id} href={`/video/${episode.video.id}`}>
                <Card className="overflow-hidden group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                  <div className="relative aspect-video bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gridCover(episode.video.id, episode.video.coverUrl)}
                      alt={episode.video.title}
                      className="w-full h-full object-cover"
                    />

                    {/* 集数徽章 */}
                    <Badge className="absolute top-2 left-2 bg-primary hover:bg-primary">
                      第 {episode.episodeNum} 集
                    </Badge>

                    {/* 时长 */}
                    {episode.video.duration && (
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(episode.video.duration)}
                      </div>
                    )}

                    {/* 悬停遮罩 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Play className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  <CardContent className="p-3">
                    <h3 className="font-medium line-clamp-2 text-sm group-hover:text-primary transition-colors">
                      {episode.episodeTitle || episode.video.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" />
                      <span>{episode.video.views.toLocaleString()} 播放</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </MotionPage>

        {/* 无剧集提示 */}
        {publishedEpisodes.length === 0 && (
          <MotionPage>
            <div className="text-center py-16">
              <p className="text-muted-foreground">该合集暂无已发布的视频</p>
            </div>
          </MotionPage>
        )}
      </div>
    </MotionPage>
  );
}
