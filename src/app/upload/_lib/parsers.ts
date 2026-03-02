import type { ParsedBatchData, ParsedSeries, ParsedVideo, ParsedGame, ParsedGameBatchData, ParsedImagePost, ParsedImageBatchData } from "./types";

/**
 * 解析视频批量导入 JSON
 *
 * 格式一（按合集分组）：
 * { series: [{ seriesTitle, description, coverUrl, videos: [{ title, videoUrl, ... }] }] }
 *
 * 格式二（扁平数组）：
 * [{ title, videoUrl, ... }]
 */
export function parseVideoBatchJson(data: unknown): ParsedBatchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;

  if (raw?.series && Array.isArray(raw.series)) {
    const series: ParsedSeries[] = raw.series.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
        seriesTitle: (s.seriesTitle as string) || "",
        description: (s.description as string) || undefined,
        coverUrl: (s.coverUrl as string) || undefined,
        videos: (Array.isArray(s.videos) ? s.videos : []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => mapRawVideo(v),
        ),
      }),
    );
    const totalVideos = series.reduce((sum, s) => sum + s.videos.length, 0);
    return { series, totalVideos };
  }

  if (Array.isArray(raw)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videos: ParsedVideo[] = raw.map((v: any) => mapRawVideo(v));
    return {
      series: [{ seriesTitle: "", videos }],
      totalVideos: videos.length,
    };
  }

  return { series: [], totalVideos: 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawVideo(v: any): ParsedVideo {
  return {
    title: (v.title as string) || "",
    description: (v.description as string) || "",
    coverUrl: (v.coverUrl as string) || "",
    videoUrl: (v.videoUrl as string) || "",
    tags: (v.tagNames as string[]) || (v.tags as string[]) || [],
    extraInfo: v.extraInfo ? stripNulls(v.extraInfo) : undefined,
  };
}

/** 递归将 JSON 中的 null 转为 undefined，避免 Zod .optional() 校验失败 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripNulls(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(obj)) {
      if (val !== null) cleaned[k] = typeof val === "object" ? stripNulls(val) : val;
    }
    return cleaned;
  }
  return obj;
}

/**
 * 解析游戏批量导入 JSON
 *
 * 格式：数组或 { games: [...] }
 */
export function parseGameBatchJson(data: unknown): ParsedGameBatchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const arr = Array.isArray(raw) ? raw : raw?.games ?? [];

  const games: ParsedGame[] = arr.map(
    (g: Record<string, unknown>) => {
      const extra = (g.extraInfo as Record<string, unknown>) || {};
      return {
        title: (g.title as string) || "",
        description: (g.description as string) || "",
        coverUrl: (g.coverUrl as string) || "",
        gameType: (g.gameType as string) || "",
        isFree: g.isFree !== false,
        version: (g.version as string) || "",
        tags: (g.tagNames as string[]) || [],
        downloads: (extra.downloads as { name: string; url: string; password?: string }[]) || [],
        screenshots: (extra.screenshots as string[]) || [],
        videos: (extra.videos as string[]) || [],
        originalName: (extra.originalName as string) || "",
        originalAuthor: (extra.originalAuthor as string) || "",
        originalAuthorUrl: (extra.originalAuthorUrl as string) || "",
        fileSize: (extra.fileSize as string) || "",
        platforms: (extra.platforms as string[]) || [],
      };
    },
  );

  return { games };
}

export function buildGameExtraInfo(g: ParsedGame): Record<string, unknown> | undefined {
  const info: Record<string, unknown> = {};
  if (g.originalName) info.originalName = g.originalName;
  if (g.originalAuthor) info.originalAuthor = g.originalAuthor;
  if (g.originalAuthorUrl) info.originalAuthorUrl = g.originalAuthorUrl;
  if (g.fileSize) info.fileSize = g.fileSize;
  if (g.platforms?.length > 0) info.platforms = g.platforms;
  if (g.screenshots?.length > 0) info.screenshots = g.screenshots;
  if (g.videos?.length > 0) info.videos = g.videos;
  if (g.downloads?.length > 0) info.downloads = g.downloads;
  return Object.keys(info).length > 0 ? info : undefined;
}

/**
 * 解析图片批量导入 JSON
 *
 * 格式：数组或 { posts: [...] }
 */
export function parseImageBatchJson(data: unknown): ParsedImageBatchData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any;
  const arr = Array.isArray(raw) ? raw : raw?.posts ?? [];

  const posts: ParsedImagePost[] = arr.map(
    (p: Record<string, unknown>) => ({
      title: (p.title as string) || "",
      description: (p.description as string) || "",
      images: (p.images as string[]) || [],
      tags: (p.tagNames as string[]) || (p.tags as string[]) || [],
    }),
  );

  return { posts };
}

// ==================== JSON 模板 ====================

export const VIDEO_BATCH_TEMPLATE = JSON.stringify({
  series: [{
    seriesTitle: "合集名称",
    description: "合集描述（可选）",
    coverUrl: "https://example.com/cover.jpg",
    videos: [{
      title: "视频标题",
      videoUrl: "https://example.com/video.mp4",
      coverUrl: "",
      tagNames: ["标签1", "标签2"],
      extraInfo: { author: "作者名", downloads: [{ name: "网盘", url: "https://..." }] },
    }],
  }],
}, null, 2);

export const GAME_BATCH_TEMPLATE = JSON.stringify([{
  title: "游戏标题",
  description: "游戏描述",
  coverUrl: "https://example.com/cover.jpg",
  gameType: "ADV",
  isFree: true,
  version: "Ver1.0",
  tagNames: ["标签1", "标签2"],
  extraInfo: {
    originalName: "原作名（可选）",
    originalAuthor: "作者",
    fileSize: "2.5GB",
    platforms: ["Windows", "Android"],
    screenshots: ["https://example.com/ss1.jpg"],
    downloads: [{ name: "夸克网盘", url: "https://...", password: "1234" }],
  },
}], null, 2);

export const IMAGE_BATCH_TEMPLATE = JSON.stringify([{
  title: "图片标题",
  description: "图片描述（可选）",
  images: [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg",
  ],
  tagNames: ["标签1", "标签2"],
}], null, 2);

export function downloadTemplate(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
