"use client";

import { useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useSiteConfig } from "@/contexts/site-config";
import { trpc } from "@/lib/trpc";
import type { Ad } from "@/lib/ads";
import { pickWeightedRandomAds } from "@/lib/ads";

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
    enabled: item.enabled !== false, // 兼容旧数据（没有 enabled 字段时默认启用）
  }));
}

/**
 * 站点配置：优先 Context（SSR），Context 为空时用 tRPC 拉取（生产环境兜底）。
 * 供 useAds 与 AdGate 等广告相关组件使用。
 */
export function useSiteConfigForAds() {
  const fromContext = useSiteConfig();
  const { data: fromApi } = trpc.site.getConfig.useQuery(undefined, {
    enabled: fromContext == null,
    staleTime: 5 * 60 * 1000,
  });
  return fromContext ?? fromApi ?? null;
}

/**
 * 获取可用广告列表和展示权限判断。
 * 优先从 SiteConfigContext（服务端预取、零延迟）读取；
 * 若生产环境 Context 为空则回退到 tRPC site.getConfig 拉取配置，保证广告可加载。
 */
export function useAds() {
  const { data: session, status } = useSession();
  const siteConfig = useSiteConfigForAds();

  const siteAdsOn = siteConfig?.adsEnabled === true;
  const userAllowsAds =
    status !== "loading" &&
    (session === null
      ? true
      : (session.user as { adsEnabled?: boolean })?.adsEnabled !== false);

  const showAds = siteAdsOn && userAllowsAds;

  const allAds = useMemo(() => parseAds(siteConfig?.sponsorAds), [siteConfig?.sponsorAds]);
  const enabledAds = useMemo(() => allAds.filter((a) => a.enabled), [allAds]);

  return { showAds, allAds, enabledAds, siteConfig };
}

/**
 * 按权重随机选取 N 条广告（客户端每次 mount 时重新选取）
 * @param count 需要的广告数量
 * @param seed  可选：改变 seed 会触发重新选取（例如页码）
 */
export function useRandomAds(count: number, seed?: string | number) {
  const { showAds, enabledAds } = useAds();

  const picked = useMemo(
    () => (showAds ? pickWeightedRandomAds(enabledAds, count) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showAds, enabledAds, count, seed]
  );

  return { ads: picked, showAds };
}
