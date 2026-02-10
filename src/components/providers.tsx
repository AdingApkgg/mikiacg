"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import superjson from "superjson";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { useVisualSettings } from "@/components/visual-settings";
import { SiteConfigProvider } from "@/contexts/site-config";
import type { PublicSiteConfig } from "@/lib/site-config";

// 注册 Service Worker（仅生产环境）
function ServiceWorkerRegistration() {
  useEffect(() => {
    // 开发环境不注册 Service Worker，避免缓存问题影响开发体验
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registered:", registration.scope);
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}

// 应用视觉设置 CSS 变量
function VisualSettingsApplier({ children }: { children: React.ReactNode }) {
  const { opacity, blur, borderRadius } = useVisualSettings();

  useEffect(() => {
    // 直接应用 CSS 变量，无需检查 mounted 状态
    document.documentElement.style.setProperty("--visual-opacity", String(opacity / 100));
    document.documentElement.style.setProperty("--visual-blur", `${blur}px`);
    document.documentElement.style.setProperty("--visual-radius", `${borderRadius}px`);
  }, [opacity, blur, borderRadius]);

  return <>{children}</>;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function Providers({ children, siteConfig }: { children: React.ReactNode; siteConfig: PublicSiteConfig }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SiteConfigProvider value={siteConfig}>
              <VisualSettingsApplier>
                <ServiceWorkerRegistration />
                {children}
                <Toaster richColors position="top-center" />
              </VisualSettingsApplier>
            </SiteConfigProvider>
          </ThemeProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
