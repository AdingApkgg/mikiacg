import { z } from "zod";

export const videoUploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
});

export type VideoUploadForm = z.infer<typeof videoUploadSchema>;

export const gameUploadSchema = z.object({
  title: z.string().min(1, "请输入游戏标题").max(200, "标题最多200个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  gameType: z.string().optional(),
  isFree: z.boolean(),
  version: z.string().max(50).optional().or(z.literal("")),
  originalName: z.string().max(200).optional().or(z.literal("")),
  originalAuthor: z.string().max(200).optional().or(z.literal("")),
  originalAuthorUrl: z.string().url().optional().or(z.literal("")),
  fileSize: z.string().max(50).optional().or(z.literal("")),
  platforms: z.string().max(200).optional().or(z.literal("")),
});

export type GameUploadForm = z.infer<typeof gameUploadSchema>;

export const imageUploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(200, "标题最多200个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
});

export type ImageUploadForm = z.infer<typeof imageUploadSchema>;
