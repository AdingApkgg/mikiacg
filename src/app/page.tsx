import { prisma } from "@/lib/prisma";
import { HomePageClient } from "./client";
import { WebsiteJsonLd, OrganizationJsonLd } from "@/components/seo/json-ld";
import { cache } from "react";
import { getPublicSiteConfig } from "@/lib/site-config";
import { pickWeightedRandomAds, type Ad } from "@/lib/ads";

/** 从 JSON 解析广告列表（兼容旧格式） */
function parseAds(raw: unknown): Ad[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    title: item.title ?? "",
    platform: item.platform ?? "",
    url: item.url ?? "",
    description: item.description ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    weight: typeof item.weight === "number" ? item.weight : 1,
    enabled: item.enabled !== false,
  }));
}

// 使用 React cache 避免重复查询
const getInitialData = cache(async () => {
  const [tags, videos, siteConfig, fullConfig] = await Promise.all([
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
    // 获取公告配置
    prisma.siteConfig.findFirst({
      select: {
        announcement: true,
        announcementEnabled: true,
      },
    }),
    // 获取完整站点配置（含广告列表，复用 Redis 缓存）
    getPublicSiteConfig(),
  ]);

  // 服务端预选 4 条广告（SSR 直出，无需客户端等待）
  const ads = parseAds(fullConfig.sponsorAds);
  const initialAds = fullConfig.adsEnabled ? pickWeightedRandomAds(ads, 4) : [];

  return { tags, videos, siteConfig, initialAds };
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
  const { tags, videos, siteConfig, initialAds } = await getInitialData();
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
        initialAds={initialAds}
      />
    </>
  );
}
