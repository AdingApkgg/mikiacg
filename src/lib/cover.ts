/**
 * 封面 URL 工具函数
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.mikiacg.vip";

/**
 * 获取视频封面 URL（相对路径，用于前端组件）
 * 如果有 coverUrl 则返回缓存代理 URL，否则返回自动生成的封面 URL
 */
export function getCoverUrl(videoId: string, coverUrl?: string | null): string {
  if (coverUrl) {
    // 本地路径直接访问，外部 URL 走代理
    if (coverUrl.startsWith("/uploads/")) {
      return coverUrl;
    }
    return `/api/cover/${encodeURIComponent(coverUrl)}`;
  }
  // 自动从视频生成封面
  return `/api/cover/video/${videoId}`;
}

/**
 * 获取视频封面完整 URL（用于 OG、JSON-LD 等需要完整 URL 的场景）
 */
export function getCoverFullUrl(videoId: string, coverUrl?: string | null): string {
  if (coverUrl) {
    // 本地路径需要拼接完整 URL
    if (coverUrl.startsWith("/")) {
      return `${BASE_URL}${coverUrl}`;
    }
    // 已经是完整 URL
    if (coverUrl.startsWith("http")) {
      return coverUrl;
    }
  }
  // 使用 API 生成的封面
  return `${BASE_URL}/api/cover/video/${videoId}`;
}

/**
 * 获取原始封面 URL（不经过代理）
 */
export function getOriginalCoverUrl(coverUrl?: string | null): string | null {
  return coverUrl || null;
}

/**
 * 默认封面 URL
 */
export const DEFAULT_COVER_URL = "/default-cover.jpg";
