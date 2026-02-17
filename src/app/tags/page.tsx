import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { TagsPageClient } from "./client";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";

const siteName = process.env.NEXT_PUBLIC_APP_NAME || "Mikiacg";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://acgn.app";

export const metadata: Metadata = {
  title: "标签",
  description: `浏览 ${siteName} 的所有标签，按分类查找 ACGN 相关内容`,
  keywords: ["标签", "分类", "ACGN", "动漫", "视频", "游戏"],
};

async function getTagsData() {
  const [videoPopularTags, videoAllTags, gamePopularTags, gameAllTags] =
    await Promise.all([
      // 视频热门标签
      prisma.tag.findMany({
        take: 20,
        where: { videos: { some: {} } },
        include: { _count: { select: { videos: true } } },
        orderBy: { videos: { _count: "desc" } },
      }),
      // 视频全部标签
      prisma.tag.findMany({
        take: 100,
        where: { videos: { some: {} } },
        include: { _count: { select: { videos: true } } },
        orderBy: { name: "asc" },
      }),
      // 游戏热门标签
      prisma.tag.findMany({
        take: 20,
        where: { games: { some: {} } },
        include: { _count: { select: { games: true } } },
        orderBy: { games: { _count: "desc" } },
      }),
      // 游戏全部标签
      prisma.tag.findMany({
        take: 100,
        where: { games: { some: {} } },
        include: { _count: { select: { games: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

  return {
    videoPopularTags,
    videoAllTags,
    gamePopularTags,
    gameAllTags,
  };
}

export default async function TagsPage() {
  const { videoPopularTags, videoAllTags, gamePopularTags, gameAllTags } =
    await getTagsData();

  const totalTags = new Set([
    ...videoAllTags.map((t) => t.id),
    ...gameAllTags.map((t) => t.id),
  ]).size;

  return (
    <>
      <CollectionPageJsonLd
        name={`标签 - ${siteName}`}
        description={`浏览 ${siteName} 的 ${totalTags} 个内容标签`}
        url={`${siteUrl}/tags`}
        numberOfItems={totalTags}
      />
      <TagsPageClient
        videoPopularTags={videoPopularTags}
        videoAllTags={videoAllTags}
        gamePopularTags={gamePopularTags}
        gameAllTags={gameAllTags}
      />
    </>
  );
}
