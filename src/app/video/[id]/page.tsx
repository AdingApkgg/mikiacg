import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VideoPageClient } from "./client";
import { cache, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCoverFullUrl } from "@/lib/cover";
import { getPublicSiteConfig } from "@/lib/site-config";
import { VideoJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";

interface VideoPageProps {
  params: Promise<{ id: string }>;
}

// 使用 React cache 避免重复查询
const getVideo = cache(async (id: string) => {
  return prisma.video.findUnique({
    where: { id },
    include: {
      uploader: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatar: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      _count: {
        select: {
          likes: true,
          dislikes: true,
          confused: true,
          favorites: true,
        },
      },
    },
  });
});

// 动态生成 metadata - 复用 getVideo 的缓存
export async function generateMetadata({ params }: VideoPageProps): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideo(id);

  if (!video) {
    return {
      title: "视频不存在",
      description: "该视频可能已被删除或不存在",
    };
  }

  const uploaderName = video.uploader.nickname || video.uploader.username;
  const description = video.description ? video.description.slice(0, 160) : `由 ${uploaderName} 上传的视频`;
  const keywords = video.tags.map(({ tag }) => tag.name);

  const siteConfig = await getPublicSiteConfig();
  const baseUrl = siteConfig.siteUrl;

  return {
    title: video.title,
    description,
    keywords: ["ACGN", "视频", ...keywords],
    authors: [{ name: uploaderName }],
    alternates: {
      canonical: `${baseUrl}/video/${id}`,
    },
    openGraph: {
      type: "video.other",
      locale: "zh_CN",
      siteName: siteConfig.siteName,
      title: video.title,
      description,
      url: `${baseUrl}/video/${id}`,
      images: [
        {
          url: getCoverFullUrl(id, video.coverUrl),
          width: 1280,
          height: 720,
          alt: video.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: video.title,
      description,
      images: [getCoverFullUrl(id, video.coverUrl)],
    },
  };
}

// 序列化视频数据用于客户端
function serializeVideo(video: NonNullable<Awaited<ReturnType<typeof getVideo>>>) {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    videoUrl: video.videoUrl,
    coverUrl: video.coverUrl,
    duration: video.duration,
    views: video.views,
    isNsfw: video.isNsfw,
    status: video.status,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
    publishedAt: video.publishedAt?.toISOString() ?? null,
    uploader: video.uploader,
    tags: video.tags,
    _count: video._count,
    pages: video.pages as { page: number; title: string; cid?: number }[] | null,
    extraInfo: video.extraInfo as import("@/lib/shortcode-parser").VideoExtraInfo | null,
  };
}

export type SerializedVideo = ReturnType<typeof serializeVideo>;

export default async function VideoPage({ params }: VideoPageProps) {
  const siteConfig = await getPublicSiteConfig();
  if (!siteConfig.sectionVideoEnabled) notFound();
  const { id } = await params;
  const video = await getVideo(id);

  if (!video) {
    notFound();
  }

  // 在服务端序列化数据，传递给客户端
  const serializedVideo = serializeVideo(video);
  const baseUrl = siteConfig.siteUrl;

  return (
    <>
      {/* SEO 结构化数据 - SSR 输出供搜索引擎首次抓取 */}
      <VideoJsonLd video={serializedVideo} baseUrl={baseUrl} />
      <BreadcrumbJsonLd
        items={[
          { name: "首页", url: baseUrl },
          { name: "视频", url: `${baseUrl}/video` },
          { name: serializedVideo.title, url: `${baseUrl}/video/${id}` },
        ]}
      />
      <Suspense fallback={<VideoPageSkeleton />}>
        <VideoPageClient id={id} initialVideo={serializedVideo} />
      </Suspense>
    </>
  );
}

function VideoPageSkeleton() {
  return (
    <div className="container py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="lg:col-span-1 space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
