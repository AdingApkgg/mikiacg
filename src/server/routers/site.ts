import { router, publicProcedure } from "../trpc";
import { getCache, setCache } from "@/lib/redis";

const SITE_CONFIG_CACHE_TTL = 300; // 5 minutes

export const siteRouter = router({
  // 获取公开的网站配置（不需要登录）
  getConfig: publicProcedure.query(async ({ ctx }) => {
    // 尝试从缓存获取
    const cacheKey = "site:config";
    const cached = await getCache<{
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
      allowGuestbook: boolean;
      contactEmail: string | null;
      socialLinks: Record<string, string> | null;
      footerText: string | null;
      footerLinks: Array<{ label: string; url: string }> | null;
      icpBeian: string | null;
      publicSecurityBeian: string | null;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    // 获取或创建默认配置
    let config = await ctx.prisma.siteConfig.findUnique({
      where: { id: "default" },
      select: {
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
        allowGuestbook: true,
        contactEmail: true,
        socialLinks: true,
        footerText: true,
        footerLinks: true,
        icpBeian: true,
        publicSecurityBeian: true,
      },
    });

    if (!config) {
      config = await ctx.prisma.siteConfig.create({
        data: { id: "default" },
        select: {
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
          allowGuestbook: true,
          contactEmail: true,
          socialLinks: true,
          footerText: true,
          footerLinks: true,
          icpBeian: true,
          publicSecurityBeian: true,
        },
      });
    }

    const result = {
      ...config,
      socialLinks: config.socialLinks as Record<string, string> | null,
      footerLinks: config.footerLinks as Array<{ label: string; url: string }> | null,
    };

    // 缓存结果
    await setCache(cacheKey, result, SITE_CONFIG_CACHE_TTL);

    return result;
  }),
});
