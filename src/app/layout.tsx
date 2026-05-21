import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppLayout } from "@/components/layout/app-layout";
import { getPublicSiteConfig } from "@/lib/site-config";
import { generateThemeCSS } from "@/lib/theme-styles";
import { isSetupComplete } from "@/lib/setup";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { GtmNoscript } from "@/components/analytics-scripts";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const siteName = config.siteName;
  const baseUrl = config.siteUrl;
  const description =
    config.siteDescription || `${siteName} 流式媒体内容分享平台，提供丰富的动画、漫画、游戏、轻小说相关内容。`;
  const keywords = config.siteKeywords
    ? config.siteKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : ["ACGN", "动漫", "视频", "anime", "动画", "漫画", "游戏", "轻小说", "二次元"];

  let metadataBase: URL;
  try {
    metadataBase = new URL(baseUrl);
  } catch {
    metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  }

  return {
    metadataBase,
    title: {
      default: `${siteName} - ${description}`,
      template: `%s | ${siteName}`,
    },
    description,
    keywords,
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: baseUrl,
      siteName,
      title: `${siteName} - ${description}`,
      description,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${siteName} - ${description}`,
      description,
      images: ["/og-image.png"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    ...(config.googleVerification || config.analyticsBingVerification
      ? {
          verification: {
            ...(config.googleVerification ? { google: config.googleVerification } : {}),
            ...(config.analyticsBingVerification
              ? { other: { "msvalidate.01": config.analyticsBingVerification } }
              : {}),
          },
        }
      : {}),
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: siteName,
    },
    applicationName: siteName,
    ...(config.siteFavicon
      ? {
          icons: {
            icon: config.siteFavicon,
            apple: config.siteFavicon,
          },
        }
      : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

// 站点配置走 globalThis 单例缓存（见 src/lib/site-config.ts），管理员改配置时调用
// reloadPublicSiteConfig() 刷新；无需 force-dynamic 阻塞所有路由。

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title="RSS Feed" href="/feed.xml" />
        <link rel="author" href="/llms.txt" />
        <link rel="help" href="/llms-full.txt" />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <GtmNoscriptWrapper />
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}

async function GtmNoscriptWrapper() {
  const siteConfig = await getPublicSiteConfig();
  return <GtmNoscript gtmId={siteConfig.analyticsGtmId} />;
}

async function RootProviders({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";

  const setupComplete = await isSetupComplete();
  if (!setupComplete && !pathname.startsWith("/setup") && !pathname.startsWith("/api")) {
    redirect("/setup");
  }

  // 服务端 UA 嗅探，决定是否需要 SSR 阶段就拉 Telegram SDK。
  // TG 各端（Android/iOS/macOS/Windows）的 webview UA 都带 `Telegram` 标识，覆盖率足够。
  // 非 TMA 用户不挂 TmaBootstrap，可彻底规避 next/script 对外部脚本的自动 preload，
  // 把这 ~50KB 的带宽让给 LCP 候选图。Hash/Proxy 嗅探兜底在客户端 Providers 内。
  const userAgent = headersList.get("user-agent") ?? "";
  const initiallyTma = /Telegram/i.test(userAgent);

  const siteConfig = await getPublicSiteConfig();
  const themeCSS = generateThemeCSS(siteConfig);
  return (
    <>
      {themeCSS && <style dangerouslySetInnerHTML={{ __html: themeCSS }} />}
      <Providers siteConfig={siteConfig} initiallyTma={initiallyTma}>
        <AppLayout>{children}</AppLayout>
      </Providers>
    </>
  );
}
