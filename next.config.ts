import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack 配置 (Next.js 16 默认使用 Turbopack)
  turbopack: {},
  images: {
    // 启用图片优化（封面图片通过 /api/cover 代理缓存到本地）
    unoptimized: false,
    // 本地图片和代理图片不需要 remotePatterns
    // 但保留以支持直接使用外部图片
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
    // 图片优化配置
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000, // 1 年
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // 优化预加载行为，减少不必要的 CSS 预加载警告
    optimizeCss: true,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "mikiacg.vip",
          },
        ],
        destination: "https://www.mikiacg.vip/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "tv.mikiacg.vip",
          },
        ],
        destination: "https://www.mikiacg.vip/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
