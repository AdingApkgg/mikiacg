import { initTRPC, TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import superjson from "superjson";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { redis, REDIS_AVAILABLE } from "@/lib/redis";
import { getSession, type AppSession } from "@/lib/auth";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/constants";
import { isPrivileged } from "@/lib/permissions";
import { resolveAdminScopes, resolveRole } from "@/lib/group-permissions";

// Context 类型
export interface Context {
  prisma: typeof prisma;
  redis: typeof redis;
  session: AppSession | null;
  ipv4Address: string | null;
  ipv6Address: string | null;
  userAgent: string | null;
  apiKeyScopes: string[] | null;
}

/**
 * 判断是否为 IPv6 地址
 */
function isIPv6(ip: string): boolean {
  return ip.includes(":");
}

/**
 * 判断是否为 IPv4 地址
 */
function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * 从 IP 列表中提取 IPv4 和 IPv6 地址
 */
function extractIpAddresses(ips: string[]): { ipv4: string | null; ipv6: string | null } {
  let ipv4: string | null = null;
  let ipv6: string | null = null;

  for (const ip of ips) {
    const trimmed = ip.trim();
    if (!trimmed) continue;

    // 处理 IPv4 映射的 IPv6 地址 (::ffff:192.168.1.1)
    const v4MappedMatch = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4MappedMatch) {
      if (!ipv4) ipv4 = v4MappedMatch[1];
      continue;
    }

    if (isIPv6(trimmed)) {
      if (!ipv6) ipv6 = trimmed;
    } else if (isIPv4(trimmed)) {
      if (!ipv4) ipv4 = trimmed;
    }
  }

  return { ipv4, ipv6 };
}

/**
 * 通过 Authorization: Bearer sk-xxx 头认证 API Key，
 * 构造与 cookie session 兼容的 AppSession
 */
async function resolveApiKey(headers: Headers | undefined): Promise<{
  session: AppSession | null;
  apiKeyScopes: string[] | null;
}> {
  if (!headers) return { session: null, apiKeyScopes: null };
  const auth = headers.get("authorization");
  if (!auth?.startsWith("Bearer sk-")) return { session: null, apiKeyScopes: null };

  const key = auth.slice(7);
  const keyHash = createHash("sha256").update(key).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      scopes: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          nickname: true,
          avatar: true,
          role: true,
          canUpload: true,
          adsEnabled: true,
          twoFactorEnabled: true,
          isBanned: true,
          group: { select: { role: true } },
        },
      },
    },
  });

  if (!apiKey) return { session: null, apiKeyScopes: null };
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { session: null, apiKeyScopes: null };
  if (apiKey.user.isBanned) return { session: null, apiKeyScopes: null };

  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const effectiveRole = resolveRole(apiKey.user.role, apiKey.user.group?.role);
  const session: AppSession = {
    user: {
      id: apiKey.user.id,
      email: apiKey.user.email,
      name: apiKey.user.nickname,
      image: apiKey.user.avatar,
      role: effectiveRole,
      canUpload: apiKey.user.canUpload,
      adsEnabled: apiKey.user.adsEnabled,
      twoFactorEnabled: apiKey.user.twoFactorEnabled,
    },
    session: { id: apiKey.id, token: key, expiresAt: apiKey.expiresAt ?? new Date("2099-12-31") },
  };

  return { session, apiKeyScopes: apiKey.scopes };
}

// 创建 Context
export async function createContext(opts?: { req?: Request }): Promise<Context> {
  const headers = opts?.req?.headers;

  // 从多个头部收集所有可能的 IP
  const forwardedFor = headers?.get("x-forwarded-for") || "";
  const realIp = headers?.get("x-real-ip") || "";
  const cfConnectingIp = headers?.get("cf-connecting-ip") || ""; // Cloudflare
  const cfConnectingIpv6 = headers?.get("cf-connecting-ipv6") || ""; // Cloudflare IPv6

  // 合并所有 IP 来源
  const allIps = [...forwardedFor.split(","), realIp, cfConnectingIp, cfConnectingIpv6].filter(Boolean);

  const { ipv4, ipv6 } = extractIpAddresses(allIps);
  const userAgent = headers?.get("user-agent") || null;

  // 优先尝试 API Key 认证，回退到 cookie session
  const apiKeyResult = await resolveApiKey(headers);
  const session = apiKeyResult.session ?? (await getSession(opts?.req));

  return {
    prisma,
    redis,
    session,
    ipv4Address: ipv4,
    ipv6Address: ipv6,
    userAgent,
    apiKeyScopes: apiKeyResult.apiKeyScopes,
  };
}

// 初始化 tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// 导出 router 和 工具
export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const createCallerFactory = t.createCallerFactory;

// ==================== 全局 API Key 权限自动检查 ====================

/**
 * 路由名 → API Key 权限范围映射表。
 * - { read, write? } — 根据操作类型（query→read, mutation→write）自动检查对应 scope
 * - "self"           — 路由内部自行管理权限检查（如 openApi）
 * - "block"          — 禁止 API Key 访问
 * 未在此表中的路由：默认禁止 API Key 访问。
 */
type ScopeMapping = { read: string; write?: string } | "self" | "block";

const API_SCOPE_ROUTER_MAP: Record<string, ScopeMapping> = {
  // 内容
  video: { read: "content:read", write: "content:write" },
  game: { read: "content:read", write: "content:write" },
  image: { read: "content:read", write: "content:write" },
  tag: { read: "content:read", write: "content:write" },
  series: { read: "content:read", write: "content:write" },
  sticker: { read: "content:read" },
  import: { read: "content:read", write: "content:write" },
  playlist: { read: "content:read", write: "content:write" },
  // 评论
  comment: { read: "comment:read", write: "comment:write" },
  gameComment: { read: "comment:read", write: "comment:write" },
  imagePostComment: { read: "comment:read", write: "comment:write" },
  // 社交
  follow: { read: "social:read", write: "social:write" },
  message: { read: "social:read", write: "social:write" },
  channel: { read: "social:read", write: "social:write" },
  guestbook: { read: "social:read", write: "social:write" },
  // 文件
  file: { read: "file:read", write: "file:write" },
  // 用户
  user: { read: "user:read", write: "user:write" },
  apiKey: { read: "user:read", write: "user:write" },
  // 推广中心
  referral: { read: "referral:read", write: "referral:write" },
  // 支付与兑换
  payment: { read: "payment:read", write: "payment:write" },
  redeem: { read: "payment:read", write: "payment:write" },
  // 通知
  notification: { read: "notification:read", write: "notification:write" },
  // 工单 / 反馈
  ticket: "block",
  // 管理后台（仍需管理员角色）
  admin: { read: "admin:read", write: "admin:write" },
  // 系统
  site: { read: "system:read" },
  // 自管理
  openApi: "self",
  // 禁止
  setup: "block",
};

/**
 * 全局 API Key 权限检查中间件。
 * 仅在请求携带 API Key 时生效，根据 tRPC 路由路径自动匹配所需权限。
 * 浏览器 session 用户不受影响。
 */
const enforceApiKeyScope = t.middleware(async ({ ctx, next, path, type }) => {
  if (!ctx.apiKeyScopes) return next();

  const routerName = (path as string).split(".")[0];
  const mapping = API_SCOPE_ROUTER_MAP[routerName];

  if (!mapping || mapping === "block") {
    throw new TRPCError({ code: "FORBIDDEN", message: "此接口不支持 API Key 访问" });
  }

  if (mapping === "self") return next();

  const requiredScope = (type as string) === "mutation" ? mapping.write : mapping.read;

  if (!requiredScope) {
    throw new TRPCError({ code: "FORBIDDEN", message: "此操作不支持 API Key 写入" });
  }

  if (!ctx.apiKeyScopes.includes(requiredScope)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `API Key 缺少权限: ${requiredScope}` });
  }

  return next();
});

/**
 * API Key 请求速率限制中间件。
 * 仅对 API Key 请求生效，使用 Redis 滑动窗口实现。
 * 默认 120 请求/分钟/Key。
 */
const API_RATE_LIMIT = 120;
const API_RATE_WINDOW_SECONDS = 60;

const enforceApiKeyRateLimit = t.middleware(async ({ ctx, next }) => {
  if (!ctx.apiKeyScopes) return next();
  if (!REDIS_AVAILABLE) return next();

  const userId = ctx.session?.user?.id;
  if (!userId) return next();

  try {
    const key = `api_rate:${userId}`;
    const now = Date.now();
    const windowStart = now - API_RATE_WINDOW_SECONDS * 1000;

    const pipeline = ctx.redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    pipeline.zcard(key);
    pipeline.expire(key, API_RATE_WINDOW_SECONDS + 5);
    const results = await pipeline.exec();

    const count = (results?.[2]?.[1] as number) || 0;
    if (count > API_RATE_LIMIT) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `API 请求过于频繁，限制 ${API_RATE_LIMIT} 次/${API_RATE_WINDOW_SECONDS}秒`,
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err;
  }

  return next();
});

// 带全局权限检查 + 速率限制的基础 procedure（所有 procedure 均从此派生）
const baseProcedure = t.procedure.use(enforceApiKeyScope).use(enforceApiKeyRateLimit);

export const publicProcedure = baseProcedure;

// ==================== 认证中间件 ====================

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const protectedProcedure = baseProcedure.use(enforceUserIsAuthed);

// 管理员中间件（ADMIN 或 OWNER），同时将 role 和 scopes 注入 context
const enforceUserIsAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: {
      role: true,
      adminScopes: true,
      group: { select: { role: true, adminScopes: true } },
    },
  });

  if (!user) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const effectiveRole = resolveRole(user.role, user.group?.role);
  if (!isPrivileged(effectiveRole)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const groupAdminScopes = (user.group?.adminScopes as string[] | null) ?? null;
  const userAdminScopes = (user.adminScopes as string[] | null) ?? null;
  const scopes = resolveAdminScopes(effectiveRole, groupAdminScopes ?? userAdminScopes);

  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      adminRole: effectiveRole as "ADMIN" | "OWNER",
      adminScopes: scopes,
    },
  });
});

const enforceUserIsOwner = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true, group: { select: { role: true } } },
  });

  const effectiveRole = resolveRole(user?.role ?? "USER", user?.group?.role);
  if (effectiveRole !== "OWNER") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅站长可执行此操作" });
  }

  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export function requireScope(scope: AdminScope) {
  return t.middleware(async ({ ctx, next }) => {
    const scopes = (ctx as Record<string, unknown>).adminScopes as string[] | undefined;
    if (!scopes?.includes(scope)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `缺少权限: ${ADMIN_SCOPES[scope]}`,
      });
    }
    return next();
  });
}

export const adminProcedure = baseProcedure.use(enforceUserIsAdmin);

export const ownerProcedure = baseProcedure.use(enforceUserIsOwner);

// ==================== 显式 API scope 检查（用于 openApi 等自管理路由）====================

/**
 * 显式 API Key scope 检查中间件工厂。
 * 用于 openApi 等自行管理权限的路由，要求请求必须携带对应 scope。
 * 浏览器 session 用户可直接访问。
 */
export function requireApiScope(scope: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "需要认证：请提供 API Key 或登录" });
    }

    if (ctx.apiKeyScopes && !ctx.apiKeyScopes.includes(scope)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `API Key 缺少权限: ${scope}` });
    }

    return next({
      ctx: { session: { ...ctx.session, user: ctx.session.user } },
    });
  });
}

export const apiScopedProcedure = (scope: string) => baseProcedure.use(requireApiScope(scope));
