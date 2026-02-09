import { router, publicProcedure } from "../trpc";
import { getOrSet } from "@/lib/redis";

const SITE_CONFIG_CACHE_TTL = 300; // 5 minutes

export const siteRouter = router({
  // 获取公开的网站配置（不需要登录）
  getConfig: publicProcedure.query(async ({ ctx }) => {
    return getOrSet("site:config", async () => {
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
            contactEmail: true,
            socialLinks: true,
            footerText: true,
            footerLinks: true,
            icpBeian: true,
            publicSecurityBeian: true,
          },
        });
      }

      return {
        ...config,
        socialLinks: config.socialLinks as Record<string, string> | null,
        footerLinks: config.footerLinks as Array<{ label: string; url: string }> | null,
      };
    }, SITE_CONFIG_CACHE_TTL);
  }),
});
