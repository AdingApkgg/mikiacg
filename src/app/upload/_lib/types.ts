import type { VideoExtraInfo } from "@/lib/shortcode-parser";

export type UploadContentType = "video" | "game" | "image";

// ==================== 视频批量 ====================

export interface ParsedVideo {
  title: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  tags: string[];
  extraInfo?: VideoExtraInfo;
}

export interface ParsedSeries {
  seriesTitle: string;
  description?: string;
  coverUrl?: string;
  videos: ParsedVideo[];
}

export interface ParsedBatchData {
  series: ParsedSeries[];
  totalVideos: number;
}

export interface VideoBatchResult {
  title: string;
  seriesTitle?: string;
  id?: string;
  error?: string;
  merged?: boolean;
}

// ==================== 游戏批量 ====================

export interface ParsedGame {
  title: string;
  description: string;
  coverUrl: string;
  gameType: string;
  isFree: boolean;
  version: string;
  tags: string[];
  downloads: { name: string; url: string; password?: string }[];
  screenshots: string[];
  videos: string[];
  originalName: string;
  originalAuthor: string;
  originalAuthorUrl: string;
  fileSize: string;
  platforms: string[];
}

export interface ParsedGameBatchData {
  games: ParsedGame[];
}

export interface GameBatchResult {
  title: string;
  id?: string;
  error?: string;
  updated?: boolean;
}

// ==================== 图片批量 ====================

export interface ParsedImagePost {
  title: string;
  description: string;
  images: string[];
  tags: string[];
}

export interface ParsedImageBatchData {
  posts: ParsedImagePost[];
}

export interface ImageBatchResult {
  title: string;
  id?: string;
  error?: string;
  updated?: boolean;
}

// ==================== 共享 ====================

export interface TagItem {
  id: string;
  name: string;
}

export interface BatchProgress {
  current: number;
  total: number;
}
