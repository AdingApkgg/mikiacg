import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import VideoListClient from "./client";
import { WebsiteJsonLd, OrganizationJsonLd, VideoListJsonLd } from "@/components/seo/json-ld";
import { cache } from "react";
import { getPublicSiteConfig } from "@/lib/site-config";
import { pickWeightedRandomAds, parseSponsorAds, resolveSlotPosition } from "@/lib/ads";
import type { Metadata } from "next";
import { videoPublicationOrderBy } from "@/lib/publication";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  return {
    title: "视频",
    description: `发现 ${config.siteName} 最新 ACGN 视频内容，精选动画、漫画、游戏、小说相关视频`,
    keywords: ["ACGN", "视频", "动画", "漫画", "游戏"],
    alternates: {
      canonical: `${config.siteUrl}/video`,
    },
    openGraph: {
      title: `视频 - ${config.siteName}`,
      description: `发现 ${config.siteName} 最新 ACGN 视频内容`,
      url: `${config.siteUrl}/video`,
      type: "website",
      siteName: config.siteName,
      locale: "zh_CN",
    },
  };
}

// 使用 React cache 避免重复查询
const getInitialData = cache(async () => {
  const fullConfig = await getPublicSiteConfig();

  const sortKey = ["latest", "views", "likes", "titleAsc", "titleDesc"].includes(fullConfig.videoDefaultSort)
    ? fullConfig.videoDefaultSort
    : "latest";
  const orderBy =
    sortKey === "views"
      ? { views: "desc" as const }
      : sortKey === "likes"
        ? { likes: { _count: "desc" as const } }
        : sortKey === "titleAsc"
          ? { title: "asc" as const }
          : sortKey === "titleDesc"
            ? { title: "desc" as const }
            : videoPublicationOrderBy;

  const [videos, siteConfig] = await Promise.all([
    // 获取首屏视频（排序跟随站点配置的默认排序）
    prisma.video.findMany({
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
  ]);

  // 服务端预选 4 条广告（SSR 直出，无需客户端等待）
  const ads = parseSponsorAds(fullConfig.sponsorAds);
  const initialAds = fullConfig.adsEnabled ? pickWeightedRandomAds(ads, 4, resolveSlotPosition("in-feed")) : [];

  return { videos, siteConfig, initialAds, initialSortBy: sortKey };
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
    publishedAt: video.publishedAt?.toISOString() ?? null,
    extraInfo: video.extraInfo,
    uploader: video.uploader,
    tags: video.tags,
    _count: video._count,
  }));
}

export default async function VideoListPage() {
  const fullSiteConfig = await getPublicSiteConfig();
  if (!fullSiteConfig.sectionVideoEnabled) notFound();
  const { videos, siteConfig, initialAds, initialSortBy } = await getInitialData();
  const serializedVideos = serializeVideos(videos);

  const description = fullSiteConfig.siteDescription || `${fullSiteConfig.siteName} ACGN 内容平台`;
  const logo =
    fullSiteConfig.siteLogo && fullSiteConfig.siteLogo.startsWith("http")
      ? fullSiteConfig.siteLogo
      : `${fullSiteConfig.siteUrl}${fullSiteConfig.siteLogo || "/Mikiacg-logo.webp"}`;

  return (
    <>
      {/* SEO 结构化数据 */}
      <WebsiteJsonLd siteName={fullSiteConfig.siteName} siteUrl={fullSiteConfig.siteUrl} description={description} />
      <OrganizationJsonLd
        name={fullSiteConfig.siteName}
        url={fullSiteConfig.siteUrl}
        logo={logo}
        contactEmail={fullSiteConfig.contactEmail}
      />
      <VideoListJsonLd videos={serializedVideos} baseUrl={fullSiteConfig.siteUrl} />

      <VideoListClient
        initialVideos={serializedVideos}
        initialSortBy={initialSortBy}
        siteConfig={siteConfig}
        initialAds={initialAds}
      />
    </>
  );
}
