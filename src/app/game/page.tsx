import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { GameListClient } from "./client";
import { cache } from "react";
import { getPublicSiteConfig } from "@/lib/site-config";
import { pickWeightedRandomAds, resolveSlotPosition, type Ad } from "@/lib/ads";
import { GameListJsonLd } from "@/components/seo/json-ld";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const url = `${config.siteUrl}/game`;
  return {
    title: "游戏",
    description: `发现 ${config.siteName} 精选 ACGN 游戏，免费下载各种 ADV、SLG、RPG、ACT 类型游戏`,
    keywords: ["ACGN", "游戏", "ADV", "SLG", "RPG", "免费游戏", "galgame"],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: config.siteName,
      url,
      title: `游戏 - ${config.siteName}`,
      description: `发现 ${config.siteName} 精选 ACGN 游戏`,
    },
  };
}

const getInitialData = cache(async () => {
  const fullConfig = await getPublicSiteConfig();

  const sortKey = fullConfig.gameDefaultSort;
  const orderBy =
    sortKey === "views"
      ? { views: "desc" as const }
      : sortKey === "titleAsc"
        ? { title: "asc" as const }
        : sortKey === "titleDesc"
          ? { title: "desc" as const }
          : { createdAt: "desc" as const };

  const [games, typeStats, siteConfig] = await Promise.all([
    // 获取首屏游戏（排序跟随站点配置的默认排序）
    prisma.game.findMany({
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
    // 获取游戏类型统计
    prisma.game.groupBy({
      by: ["gameType"],
      where: { status: "PUBLISHED" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    // 获取公告配置
    prisma.siteConfig.findFirst({
      select: {
        announcement: true,
        announcementEnabled: true,
      },
    }),
  ]);

  // 服务端预选 4 条广告（SSR 直出）
  const rawAds: Ad[] = Array.isArray(fullConfig.sponsorAds)
    ? (fullConfig.sponsorAds as Ad[]).filter((a) => a.enabled !== false)
    : [];
  const initialAds = fullConfig.adsEnabled ? pickWeightedRandomAds(rawAds, 4, resolveSlotPosition("in-feed")) : [];

  return {
    games,
    siteConfig,
    initialAds,
    typeStats: typeStats.map((s) => ({
      type: s.gameType || "OTHER",
      count: s._count.id,
    })),
  };
});

function serializeGames(games: Awaited<ReturnType<typeof getInitialData>>["games"]) {
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    description: game.description,
    coverUrl: game.coverUrl,
    gameType: game.gameType,
    isFree: game.isFree,
    version: game.version,
    views: game.views,
    createdAt: game.createdAt.toISOString(),
    extraInfo: game.extraInfo,
    uploader: game.uploader,
    tags: game.tags,
    _count: game._count,
  }));
}

export default async function GameListPage() {
  const fullSiteConfig = await getPublicSiteConfig();
  if (!fullSiteConfig.sectionGameEnabled) notFound();
  const { games, typeStats, siteConfig, initialAds } = await getInitialData();
  const serializedGames = serializeGames(games);

  return (
    <>
      <GameListJsonLd games={serializedGames} baseUrl={fullSiteConfig.siteUrl} />
      <GameListClient
        initialGames={serializedGames}
        typeStats={typeStats}
        siteConfig={siteConfig}
        initialAds={initialAds}
      />
    </>
  );
}
