import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ImageDetailClient } from "./client";
import { cache, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicSiteConfig } from "@/lib/site-config";

interface ImagePageProps {
  params: Promise<{ id: string }>;
}

const getImagePost = cache(async (id: string) => {
  return prisma.imagePost.findUnique({
    where: { id },
    include: {
      uploader: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
      tags: {
        include: { tag: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
});

export async function generateMetadata({ params }: ImagePageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await getImagePost(id);

  if (!post) {
    return { title: "图片不存在", description: "该图片可能已被删除或不存在" };
  }

  const uploaderName = post.uploader.nickname || post.uploader.username;
  const description = post.description
    ? post.description.slice(0, 160)
    : `${uploaderName} 分享的图片`;
  const keywords = post.tags.map(({ tag }) => tag.name);
  const images = (post.images as string[]) ?? [];

  const siteConfig = await getPublicSiteConfig();
  const baseUrl = siteConfig.siteUrl;

  return {
    title: post.title,
    description,
    keywords: ["ACGN", "图片", "插画", ...keywords],
    authors: [{ name: uploaderName }],
    openGraph: {
      type: "website",
      title: post.title,
      description,
      url: `${baseUrl}/image/${id}`,
      ...(images.length > 0 && {
        images: [
          {
            url: images[0].startsWith("http") ? images[0] : `${baseUrl}${images[0]}`,
            alt: post.title,
          },
        ],
      }),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

function serializePost(post: NonNullable<Awaited<ReturnType<typeof getImagePost>>>) {
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    images: post.images as string[],
    views: post.views,
    status: post.status,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    uploader: post.uploader,
    tags: post.tags,
  };
}

export type SerializedImagePost = ReturnType<typeof serializePost>;

export default async function ImagePage({ params }: ImagePageProps) {
  const { id } = await params;
  const post = await getImagePost(id);

  if (!post) notFound();

  const serialized = serializePost(post);

  return (
    <Suspense fallback={<ImagePageSkeleton />}>
      <ImageDetailClient post={serialized} />
    </Suspense>
  );
}

function ImagePageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
      <Skeleton className="h-5 w-28 mb-4" />
      <Skeleton className="h-8 w-3/4 mb-2" />
      <Skeleton className="h-4 w-1/2 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}
