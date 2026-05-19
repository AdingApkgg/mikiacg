import { PrismaClient } from "@/generated/prisma/client";
import { TRPCError } from "@trpc/server";
import { isPrivileged } from "@/lib/permissions";
import { resolvePermissions, resolveRole, type GroupPermissions } from "@/lib/group-permissions";

type ContentType = "video" | "game" | "imagePost";

const MODEL_MAP = {
  video: "video",
  game: "game",
  imagePost: "imagePost",
} as const;

const DEFAULT_UPLOAD_BATCH_LIMIT = 1000;

/**
 * 生成随机 6 位数字 ID，保证唯一。
 */
export async function generateContentId(prisma: PrismaClient, type: ContentType): Promise<string> {
  const maxAttempts = 100;
  const model = MODEL_MAP[type];

  for (let i = 0; i < maxAttempts; i++) {
    const num = Math.floor(Math.random() * 1000000);
    const id = num.toString().padStart(6, "0");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma[model] as any).findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return id;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "无法生成唯一 ID，请稍后重试",
  });
}

/**
 * 批量生成唯一 ID，一次性候选池 + 批量查重。
 */
export async function generateContentIds(prisma: PrismaClient, type: ContentType, count: number): Promise<string[]> {
  if (count === 0) return [];
  const model = MODEL_MAP[type];

  const candidates: string[] = [];
  const candidateSet = new Set<string>();
  const poolSize = count * 3;
  while (candidates.length < poolSize) {
    const num = Math.floor(Math.random() * 1000000);
    const id = num.toString().padStart(6, "0");
    if (!candidateSet.has(id)) {
      candidateSet.add(id);
      candidates.push(id);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingRows = await (prisma[model] as any).findMany({
    where: { id: { in: candidates } },
    select: { id: true },
  });
  const existingIds = new Set<string>(existingRows.map((r: { id: string }) => r.id));

  const result: string[] = [];
  for (const id of candidates) {
    if (!existingIds.has(id)) {
      result.push(id);
      if (result.length >= count) break;
    }
  }

  if (result.length < count) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "无法生成足够唯一 ID，请稍后重试",
    });
  }

  return result;
}

export function generateTagSlug(tagName: string): string {
  return (
    tagName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`
  );
}

/**
 * 规范化标签名：剥离形如 ` (N)` / `（N）` 的尾部计数后缀（含 NBSP），合并多余空白。
 * 不做大小写、繁简转换。空串退回 trim 后的原值，避免吞掉退化输入。
 */
export function normalizeTagName(name: string): string {
  const stripped = name
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/[\s ]*\(\d+\)\s*$/u, "")
    .replace(/[\s ]+/g, " ")
    .trim();
  return stripped || name.trim();
}

/**
 * 批量将标签名称解析为 tagId。
 * - 写入前 normalizeTagName 剥离尾部 `(N)` 后缀，新数据统一落到规范化 Tag 上；
 * - 同时按 TagAlias 查询，避免历史脏数据继续累积；
 * - 原始名（若 != canonical）写入 TagAlias，便于后续按原名查找。
 */
export async function resolveTagNames(prisma: PrismaClient, tagNames: string[]): Promise<Map<string, string>> {
  const tagNameToId = new Map<string, string>();
  if (tagNames.length === 0) return tagNameToId;

  const unique = [...new Set(tagNames)];

  const CONCURRENCY = 10;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (original) => {
        const canonical = normalizeTagName(original);
        if (!canonical) return;
        const slug = generateTagSlug(canonical);

        let tag = await prisma.tag.findFirst({
          where: {
            OR: [{ name: canonical }, { aliases: { some: { name: canonical } } }],
          },
          select: { id: true, name: true },
        });

        if (!tag) {
          try {
            tag = await prisma.tag.upsert({
              where: { name: canonical },
              update: {},
              create: { name: canonical, slug },
              select: { id: true, name: true },
            });
          } catch {
            const fallback = await prisma.tag.findFirst({
              where: { OR: [{ name: canonical }, { slug }] },
              select: { id: true, name: true },
            });
            if (fallback) tag = fallback;
          }
        }

        if (!tag) return;
        tagNameToId.set(original, tag.id);

        if (original !== tag.name) {
          try {
            await prisma.tagAlias.upsert({
              where: { name: original },
              update: {},
              create: { name: original, tagId: tag.id },
            });
          } catch {
            // 别名已被其它 tag 占用，忽略；merge 脚本会处理
          }
        }
      }),
    );
  }

  return tagNameToId;
}

/**
 * 合并 tagIds + tagNames 得到去重 tagId 列表。
 */
export async function resolveAllTagIds(
  prisma: PrismaClient,
  tagIds?: string[],
  tagNames?: string[],
): Promise<string[]> {
  const ids = new Set<string>(tagIds ?? []);

  if (tagNames?.length) {
    const nameToId = await resolveTagNames(prisma, tagNames);
    for (const id of nameToId.values()) ids.add(id);
  }

  return [...ids];
}

/**
 * 根据用户角色决定发布状态：管理员/站长 PUBLISHED，普通用户 PENDING。
 */
export function resolvePublishStatus(userRole: string): "PUBLISHED" | "PENDING" {
  return isPrivileged(userRole) ? "PUBLISHED" : "PENDING";
}

/**
 * 检查用户投稿权限，不满足则抛出 TRPCError。
 * 综合考虑用户组的 role 和 permissions.canUpload。
 */
export async function assertCanUpload(
  prisma: PrismaClient,
  userId: string,
): Promise<{ role: string; canUpload: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      canUpload: true,
      group: { select: { role: true, permissions: true } },
    },
  });

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
  }

  const effectiveRole = resolveRole(user.role, user.group?.role);
  const perms = resolvePermissions(effectiveRole, user.group?.permissions as Partial<GroupPermissions> | null);
  const canUpload = isPrivileged(effectiveRole) || perms.canUpload || user.canUpload === true;

  if (!canUpload) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "暂无投稿权限，请联系管理员开通",
    });
  }

  return { role: effectiveRole, canUpload };
}

/**
 * 检查内容归属权限，不满足则抛出 TRPCError。
 */
export function assertOwnership(
  uploaderId: string,
  currentUserId: string,
  userRole: string,
  message = "无权操作此内容",
): void {
  if (uploaderId !== currentUserId && !isPrivileged(userRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

/**
 * 异步刷新标签计数（不阻塞主请求）。
 */
export function scheduleTagCountRefresh(tagIds: string[], label: string): void {
  if (tagIds.length === 0) return;
  import("@/lib/tag-counts")
    .then(({ refreshTagCounts }) => refreshTagCounts(tagIds))
    .catch((err) => {
      console.error(`[tag-counts] ${label}后刷新失败`, err);
    });
}

/**
 * 从 SiteConfig 读取用户投稿批量上限。
 */
export async function getUploadBatchLimit(prisma: PrismaClient): Promise<number> {
  try {
    const config = await prisma.siteConfig.findUnique({
      where: { id: "default" },
      select: { uploadBatchLimit: true },
    });
    return config?.uploadBatchLimit ?? DEFAULT_UPLOAD_BATCH_LIMIT;
  } catch {
    return DEFAULT_UPLOAD_BATCH_LIMIT;
  }
}

/**
 * 校验批量投稿数量是否超出后台配置上限。
 */
export async function assertBatchLimit(prisma: PrismaClient, count: number): Promise<void> {
  const limit = await getUploadBatchLimit(prisma);
  if (count > limit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `批量投稿上限为 ${limit} 条，当前 ${count} 条，请在后台系统设置中调整`,
    });
  }
}
