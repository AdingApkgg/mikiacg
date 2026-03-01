import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/redis";
import type { Ad } from "@/lib/ads";

/** 公开站点配置的类型定义 */
export interface PublicSiteConfig {
  siteName: string;
  siteUrl: string;
  siteDescription: string | null;
  siteLogo: string | null;
  siteFavicon: string | null;
  siteKeywords: string | null;
  googleVerification: string | null;
  githubUrl: string | null;
  securityEmail: string | null;
  announcement: string | null;
  announcementEnabled: boolean;
  allowRegistration: boolean;
  allowUpload: boolean;
  allowComment: boolean;
  requireLoginToComment: boolean;
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
  effectEnabled: boolean;
  effectType: string;
  effectDensity: number;
  effectSpeed: number;
  effectOpacity: number;
  effectColor: string;
  soundDefaultEnabled: boolean;
}

const selectFields = {
  siteName: true,
  siteUrl: true,
  siteDescription: true,
  siteLogo: true,
  siteFavicon: true,
  siteKeywords: true,
  googleVerification: true,
  githubUrl: true,
  securityEmail: true,
  announcement: true,
  announcementEnabled: true,
  allowRegistration: true,
  allowUpload: true,
  allowComment: true,
  requireLoginToComment: true,
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
  effectEnabled: true,
  effectType: true,
  effectDensity: true,
  effectSpeed: true,
  effectOpacity: true,
  effectColor: true,
  soundDefaultEnabled: true,
} as const;

const defaultConfig: PublicSiteConfig = {
  siteName: process.env.NEXT_PUBLIC_APP_NAME || "ACGN Site",
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  siteDescription: null,
  siteLogo: null,
  siteFavicon: null,
  siteKeywords: null,
  googleVerification: null,
  githubUrl: null,
  securityEmail: null,
  announcement: null,
  announcementEnabled: false,
  allowRegistration: true,
  allowUpload: true,
  allowComment: true,
  requireLoginToComment: false,
  contactEmail: null,
  socialLinks: null,
  footerText: null,
  footerLinks: null,
  icpBeian: null,
  publicSecurityBeian: null,
  adsEnabled: false,
  adGateEnabled: false,
  adGateViewsRequired: 3,
  adGateHours: 12,
  sponsorAds: null,
  effectEnabled: true,
  effectType: "sakura",
  effectDensity: 50,
  effectSpeed: 1.0,
  effectOpacity: 0.8,
  effectColor: "",
  soundDefaultEnabled: true,
};

/**
 * 服务端获取公开站点配置（使用 Redis 5 分钟缓存 + React cache 请求去重）
 * 可在 layout.tsx / page.tsx 等 Server Component 中直接调用。
 */
export const getPublicSiteConfig = cache(async (): Promise<PublicSiteConfig> => {
  try {
    return await getOrSet(
      "site:config",
      async () => {
        let config: Record<string, unknown> | null = null;

        try {
          config = await prisma.siteConfig.findUnique({
            where: { id: "default" },
            select: selectFields,
          }) as Record<string, unknown> | null;
        } catch {
          // 新字段尚未迁移时 select 可能失败，回退到全量查询
          config = await prisma.siteConfig.findUnique({
            where: { id: "default" },
          }) as Record<string, unknown> | null;
        }

        if (!config) {
          try {
            config = await prisma.siteConfig.create({
              data: { id: "default" },
              select: selectFields,
            }) as Record<string, unknown> | null;
          } catch {
            config = await prisma.siteConfig.create({
              data: { id: "default" },
            }) as Record<string, unknown> | null;
          }
        }

        if (!config) return defaultConfig;

        return {
          ...defaultConfig,
          ...Object.fromEntries(
            Object.entries(config).filter(([key]) => key in defaultConfig)
          ),
          siteUrl: (config.siteUrl as string) || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          socialLinks: config.socialLinks as Record<string, string> | null,
          footerLinks: config.footerLinks as Array<{ label: string; url: string }> | null,
          sponsorAds: config.sponsorAds as Ad[] | null,
        };
      },
      300 // 5 minutes TTL
    );
  } catch {
    // 数据库或 Redis 完全不可用时返回默认配置，确保页面可渲染
    return defaultConfig;
  }
});
