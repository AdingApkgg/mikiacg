import { router, publicProcedure } from "../trpc";
import { getPublicSiteConfig } from "@/lib/site-config";

export const siteRouter = router({
  // 获取公开的网站配置（不需要登录）
  // 复用 getPublicSiteConfig（与布局层 SSR 预取共享 Redis 缓存），避免重复代码
  getConfig: publicProcedure.query(async () => {
    return getPublicSiteConfig();
  }),
});
