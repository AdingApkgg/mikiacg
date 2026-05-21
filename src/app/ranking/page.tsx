import type { Metadata } from "next";
import { getPublicSiteConfig } from "@/lib/site-config";
import { RankingClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  return {
    title: "排行榜",
    description: `${config.siteName} 排行榜：热门排行、日榜、周榜、月榜、飙升榜`,
    alternates: {
      canonical: `${config.siteUrl}/ranking`,
    },
    openGraph: {
      title: `排行榜 - ${config.siteName}`,
      description: `${config.siteName} 排行榜`,
      url: `${config.siteUrl}/ranking`,
      type: "website",
      siteName: config.siteName,
      locale: "zh_CN",
    },
  };
}

export default async function RankingPage() {
  const config = await getPublicSiteConfig();
  return <RankingClient rankingEnabled={config.rankingEnabled} />;
}
