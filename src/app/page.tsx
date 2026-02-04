import { prisma } from "@/lib/prisma";
import { HomePageClient } from "./client";
import { WebsiteJsonLd, OrganizationJsonLd } from "@/components/seo/json-ld";
import { cache } from "react";

// 使用 React cache 避免重复查询
const getInitialData = cache(async () => {
  const [tags, videos, siteConfig] = await Promise.all([
    // 获取热门标签
    prisma.tag.findMany({
      take: 30,
      orderBy: { videos: { _count: "desc" } },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    // 获取最新视频（首屏数据）
    prisma.video.findMany({
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
        _count: { select: { likes: true, dislikes: true, favorites: true } },
      },
    }),
    // 获取网站配置
    prisma.siteConfig.findFirst({
      select: {
        announcement: true,
        announcementEnabled: true,
      },
    }),
  ]);

  return { tags, videos, siteConfig };
});

// 序列化视频数据
function serializeVideos(videos: Awaited<ReturnType<typeof getInitialData>>["videos"]) {
  return videos.map((video) => ({
    id: video.id,
    title: video.title,
    coverUrl: video.coverUrl,
    duration: video.duration,
    views: video.views,
    createdAt: video.createdAt.toISOString(),
    uploader: video.uploader,
    tags: video.tags,
    _count: video._count,
  }));
}

export default async function HomePage() {
  const { tags, videos, siteConfig } = await getInitialData();
  const serializedVideos = serializeVideos(videos);

  return (
    <>
      {/* SEO 结构化数据 */}
      <WebsiteJsonLd />
      <OrganizationJsonLd />

      <HomePageClient
        initialTags={tags}
        initialVideos={serializedVideos}
        siteConfig={siteConfig}
      />
    </>
  );
}
