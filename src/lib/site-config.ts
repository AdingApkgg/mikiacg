import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/redis";
import type { Ad } from "@/lib/ads";

/** 公开站点配置的类型定义 */
export interface PublicSiteConfig {
  siteName: string;
  siteDescription: string | null;
  siteLogo: string | null;
  siteFavicon: string | null;
  siteKeywords: string | null;
  announcement: string | null;
  announcementEnabled: boolean;
  allowRegistration: boolean;
  allowUpload: boolean;
  allowComment: boolean;
  contactEmail: string | null;
  socialLinks: Record<string, string> | null;
  footerText: string | null;
  footerLinks: Array<{ label: string; url: string }> | null;
  icpBeian: string | null;
  publicSecurityBeian: string | null;
  adsEnabled: boolean;
  adGateEnabled: boolean;
  adGateViewsRequired: number;
  adGateHours: number;
  sponsorAds: Ad[] | null;
}

const selectFields = {
  siteName: true,
  siteDescription: true,
  siteLogo: true,
  siteFavicon: true,
  siteKeywords: true,
  announcement: true,
  announcementEnabled: true,
  allowRegistration: true,
  allowUpload: true,
  allowComment: true,
  contactEmail: true,
  socialLinks: true,
  footerText: true,
  footerLinks: true,
  icpBeian: true,
  publicSecurityBeian: true,
  adsEnabled: true,
  adGateEnabled: true,
  adGateViewsRequired: true,
  adGateHours: true,
  sponsorAds: true,
} as const;

/**
 * 服务端获取公开站点配置（使用 Redis 5 分钟缓存 + React cache 请求去重）
 * 可在 layout.tsx / page.tsx 等 Server Component 中直接调用。
 */
export const getPublicSiteConfig = cache(async (): Promise<PublicSiteConfig> => {
  return getOrSet(
    "site:config",
    async () => {
      let config = await prisma.siteConfig.findUnique({
        where: { id: "default" },
        select: selectFields,
      });

      if (!config) {
        config = await prisma.siteConfig.create({
          data: { id: "default" },
          select: selectFields,
        });
      }

      return {
        ...config,
        socialLinks: config.socialLinks as Record<string, string> | null,
        footerLinks: config.footerLinks as Array<{ label: string; url: string }> | null,
        sponsorAds: config.sponsorAds as Ad[] | null,
      };
    },
    300 // 5 minutes TTL
  );
});
