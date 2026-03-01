import { prisma } from "@/lib/prisma";
import { ImageListClient } from "./client";
import { cache } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "图片",
  description: "发现精选 ACGN 插画、同人图、壁纸等图片内容",
  keywords: ["ACGN", "图片", "插画", "同人", "壁纸"],
};

const getInitialData = cache(async () => {
  const [tags, posts] = await Promise.all([
    prisma.tag.findMany({
      where: {
        imagePosts: { some: { imagePost: { status: "PUBLISHED" } } },
      },
      take: 30,
      orderBy: { imagePosts: { _count: "desc" } },
      select: { id: true, name: true, slug: true },
    }),
    prisma.imagePost.findMany({
      take: 20,
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
      },
    }),
  ]);

  return { tags, posts };
});

function serializePosts(posts: Awaited<ReturnType<typeof getInitialData>>["posts"]) {
  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    description: post.description,
    coverUrl: post.coverUrl,
    images: post.images as string[],
    views: post.views,
    createdAt: post.createdAt.toISOString(),
    uploader: post.uploader,
    tags: post.tags,
  }));
}

export default async function ImageListPage() {
  const { tags, posts } = await getInitialData();
  const serializedPosts = serializePosts(posts);

  return (
    <ImageListClient
      initialTags={tags}
      initialPosts={serializedPosts}
    />
  );
}
