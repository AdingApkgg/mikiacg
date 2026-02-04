/**
 * 封面 URL 工具函数
 */

/**
 * 获取视频封面 URL
 * 如果有 coverUrl 则返回缓存代理 URL，否则返回自动生成的封面 URL
 */
export function getCoverUrl(videoId: string, coverUrl?: string | null): string {
  if (coverUrl) {
    // 使用代理缓存外部图片
    return `/api/cover/${encodeURIComponent(coverUrl)}`;
  }
  // 自动从视频生成封面
  return `/api/cover/video/${videoId}`;
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
