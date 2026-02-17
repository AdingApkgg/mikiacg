"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileVideo, Tag } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import type { SerializedVideoTag } from "./page";

interface VideoTagPageClientProps {
  slug: string;
  initialTag: SerializedVideoTag | null;
}

export function VideoTagPageClient({
  slug,
  initialTag,
}: VideoTagPageClientProps) {
  const [page, setPage] = useState(1);

  const { data: tag, isLoading: tagLoading } = trpc.tag.getBySlug.useQuery(
    { slug, type: "video" },
    {
      staleTime: initialTag ? 60000 : 0,
      refetchOnMount: !initialTag,
    }
  );

  const displayTag = tag || initialTag;

  const { data, isLoading } = trpc.video.list.useQuery(
    { limit: 20, page, tagId: displayTag?.id },
    {
      enabled: !!displayTag?.id,
      placeholderData: (prev) => prev,
    }
  );

  const videos = data?.videos ?? [];
  const totalPages = data?.totalPages ?? 1;

  if (!initialTag && !displayTag && !tagLoading) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">标签不存在</h1>
        <p className="text-muted-foreground mt-2">
          找不到标签 &ldquo;{slug}&rdquo;
        </p>
        <Button asChild className="mt-4">
          <Link href="/">浏览全部视频</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Tag className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              #{displayTag?.name || initialTag?.name}
              <FileVideo className="h-5 w-5 text-muted-foreground" />
            </h1>
            <p className="text-sm text-muted-foreground">
              共{" "}
              {displayTag?._count?.videos ??
                initialTag?._count?.videos ??
                0}{" "}
              个视频
            </p>
          </div>
        </div>
      </div>

      <VideoGrid
        videos={videos}
        isLoading={isLoading || (!initialTag && tagLoading)}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        className="mt-8"
      />

      {!isLoading && videos.length === 0 && displayTag && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">该标签下暂无视频</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">浏览全部视频</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
