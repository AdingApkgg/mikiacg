import { z } from "zod";

export const TICKET_CATEGORIES = [
  "BUG",
  "RESOURCE_REQUEST",
  "FEATURE_REQUEST",
  "CONTENT_REPORT",
  "ACCOUNT_ISSUE",
  "OTHER",
] as const;

export const TICKET_STATUSES = ["PENDING", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"] as const;

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const TICKET_CATEGORY_LABELS: Record<(typeof TICKET_CATEGORIES)[number], string> = {
  BUG: "BUG 反馈",
  RESOURCE_REQUEST: "求资源",
  FEATURE_REQUEST: "功能建议",
  CONTENT_REPORT: "内容举报",
  ACCOUNT_ISSUE: "账号问题",
  OTHER: "其他",
};

export const TICKET_STATUS_LABELS: Record<(typeof TICKET_STATUSES)[number], string> = {
  PENDING: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_USER: "等待用户补充",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
};

export const TICKET_PRIORITY_LABELS: Record<(typeof TICKET_PRIORITIES)[number], string> = {
  LOW: "低",
  NORMAL: "普通",
  HIGH: "高",
  URGENT: "紧急",
};

export const RESOURCE_REQUEST_TYPES = ["anime", "manga", "image", "game", "other"] as const;

export const RESOURCE_REQUEST_TYPE_LABELS: Record<(typeof RESOURCE_REQUEST_TYPES)[number], string> = {
  anime: "番剧",
  manga: "漫画",
  image: "图片",
  game: "游戏",
  other: "其他",
};

export const REPORT_TARGET_TYPES = ["video", "image_post", "game", "comment", "user", "other"] as const;

export const REPORT_TARGET_TYPE_LABELS: Record<(typeof REPORT_TARGET_TYPES)[number], string> = {
  video: "视频",
  image_post: "图片帖子",
  game: "游戏",
  comment: "评论",
  user: "用户",
  other: "其他",
};

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().max(200),
  size: z.number().int().nonnegative().optional(),
  type: z.string().max(100).optional(),
});

export const attachmentsSchema = z.array(attachmentSchema).max(6).optional();

const bugMetadataSchema = z.object({
  page: z.string().max(500).optional(),
  browser: z.string().max(200).optional(),
  device: z.string().max(200).optional(),
});

const resourceRequestMetadataSchema = z.object({
  resourceType: z.enum(RESOURCE_REQUEST_TYPES),
  name: z.string().min(1, "请填写资源名称").max(200),
  year: z
    .string()
    .max(20)
    .optional()
    .transform((v) => v?.trim() || undefined),
  link: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || undefined),
});

const contentReportMetadataSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().max(200).optional(),
  reason: z.string().min(1, "请填写举报原因").max(500),
});

export const ticketMetadataSchemas = {
  BUG: bugMetadataSchema,
  RESOURCE_REQUEST: resourceRequestMetadataSchema,
  FEATURE_REQUEST: z.object({}).optional(),
  CONTENT_REPORT: contentReportMetadataSchema,
  ACCOUNT_ISSUE: z.object({}).optional(),
  OTHER: z.object({}).optional(),
} as const;

export type TicketCategoryKey = (typeof TICKET_CATEGORIES)[number];
export type BugMetadata = z.infer<typeof bugMetadataSchema>;
export type ResourceRequestMetadata = z.infer<typeof resourceRequestMetadataSchema>;
export type ContentReportMetadata = z.infer<typeof contentReportMetadataSchema>;
export type TicketAttachment = z.infer<typeof attachmentSchema>;

/** 根据分类校验提交时的 metadata 字段 */
export function validateTicketMetadata(category: TicketCategoryKey, raw: unknown) {
  const schema = ticketMetadataSchemas[category];
  if (!schema) return undefined;
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

export const createTicketInputSchema = z.object({
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().min(2, "标题至少 2 个字").max(120, "标题最长 120 字"),
  content: z.string().min(5, "请填写更详细的描述").max(5000),
  priority: z.enum(TICKET_PRIORITIES).default("NORMAL"),
  metadata: z.unknown().optional(),
  attachments: attachmentsSchema,
});

export const replyTicketInputSchema = z.object({
  ticketId: z.string().cuid(),
  content: z.string().min(1, "内容不能为空").max(5000),
  attachments: attachmentsSchema,
});

export const adminReplyTicketInputSchema = replyTicketInputSchema.extend({
  isInternal: z.boolean().default(false),
});

export const updateTicketStatusInputSchema = z.object({
  ticketId: z.string().cuid(),
  status: z.enum(TICKET_STATUSES),
});

export const updateTicketAdminInputSchema = z.object({
  ticketId: z.string().cuid(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
});
