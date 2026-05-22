import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ImageListClient } from "./client";
import { cache } from "react";
import { getPublicSiteConfig } from "@/lib/site-config";
import { ImageListJsonLd } from "@/components/seo/json-ld";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const url = `${config.siteUrl}/image`;
  return {
    title: "图片",
    description: `发现 ${config.siteName} 精选 ACGN 插画、同人图、壁纸等图片内容`,
    keywords: ["ACGN", "图片", "插画", "同人", "壁纸"],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: config.siteName,
      url,
      title: `图片 - ${config.siteName}`,
      description: `发现 ${config.siteName} 精选 ACGN 插画`,
    },
  };
}

const getInitialData = cache(async () => {
  const fullConfig = await getPublicSiteConfig();

  const sortKey = fullConfig.imageDefaultSort;
  const orderBy =
    sortKey === "views"
      ? { views: "desc" as const }
      : sortKey === "titleAsc"
        ? { title: "asc" as const }
        : sortKey === "titleDesc"
          ? { title: "desc" as const }
          : { createdAt: "desc" as const };

  const posts = await prisma.imagePost.findMany({
    take: 20,
    where: { status: "PUBLISHED" },
    orderBy,
    include: {
      uploader: {
        select: { id: true, username: true, nickname: true, avatar: true },
      },
      tags: {
        include: { tag: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  return { posts };
});

function serializePosts(posts: Awaited<ReturnType<typeof getInitialData>>["posts"]) {
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    description: post.description,
    images: post.images as string[],
    views: post.views,
    createdAt: post.createdAt.toISOString(),
    uploader: post.uploader,
    tags: post.tags,
  }));
}

export default async function ImageListPage() {
  const config = await getPublicSiteConfig();
  if (!config.sectionImageEnabled) notFound();
  const { posts } = await getInitialData();
  const serializedPosts = serializePosts(posts);

  return (
    <>
      <ImageListJsonLd posts={serializedPosts} baseUrl={config.siteUrl} />
      <ImageListClient initialPosts={serializedPosts} />
    </>
  );
}
