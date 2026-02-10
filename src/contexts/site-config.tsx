"use client";

import { createContext, useContext } from "react";
import type { PublicSiteConfig } from "@/lib/site-config";

const SiteConfigContext = createContext<PublicSiteConfig | null>(null);

export function SiteConfigProvider({
  value,
  children,
}: {
  value: PublicSiteConfig;
  children: React.ReactNode;
}) {
  return (
    <SiteConfigContext.Provider value={value}>
      {children}
    </SiteConfigContext.Provider>
  );
}

/**
 * 从 Context 中获取服务端预取的 siteConfig。
 * 如果 Context 不可用（极端情况），返回 null。
 */
export function useSiteConfig(): PublicSiteConfig | null {
  return useContext(SiteConfigContext);
}
