import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { PointsTransactionType } from "@/generated/prisma/client";

export type PointsAction =
  | "DAILY_LOGIN"
  | "WATCH_VIDEO"
  | "LIKE_VIDEO"
  | "FAVORITE_VIDEO"
  | "COMMENT_VIDEO"
  | "VIEW_GAME"
  | "LIKE_GAME"
  | "FAVORITE_GAME"
  | "COMMENT_GAME"
  | "VIEW_IMAGE"
  | "LIKE_IMAGE"
  | "FAVORITE_IMAGE"
  | "COMMENT_IMAGE";

export interface PointsRule {
  enabled: boolean;
  points: number;
  dailyLimit: number; // 0 = unlimited
}

export type PointsRulesConfig = Record<PointsAction, PointsRule>;

export const ACTION_LABELS: Record<PointsAction, string> = {
  DAILY_LOGIN: "每日登录",
  WATCH_VIDEO: "观看视频",
  LIKE_VIDEO: "点赞视频",
  FAVORITE_VIDEO: "收藏视频",
  COMMENT_VIDEO: "评论视频",
  VIEW_GAME: "浏览游戏",
  LIKE_GAME: "点赞游戏",
  FAVORITE_GAME: "收藏游戏",
  COMMENT_GAME: "评论游戏",
  VIEW_IMAGE: "浏览图片",
  LIKE_IMAGE: "点赞图片",
  FAVORITE_IMAGE: "收藏图片",
  COMMENT_IMAGE: "评论图片",
};

export const DEFAULT_POINTS_RULES: PointsRulesConfig = {
  DAILY_LOGIN:    { enabled: false, points: 10,  dailyLimit: 1 },
  WATCH_VIDEO:    { enabled: false, points: 1,   dailyLimit: 20 },
  LIKE_VIDEO:     { enabled: false, points: 1,   dailyLimit: 10 },
  FAVORITE_VIDEO: { enabled: false, points: 2,   dailyLimit: 10 },
  COMMENT_VIDEO:  { enabled: false, points: 3,   dailyLimit: 5 },
  VIEW_GAME:      { enabled: false, points: 1,   dailyLimit: 20 },
  LIKE_GAME:      { enabled: false, points: 1,   dailyLimit: 10 },
  FAVORITE_GAME:  { enabled: false, points: 2,   dailyLimit: 10 },
  COMMENT_GAME:   { enabled: false, points: 3,   dailyLimit: 5 },
  VIEW_IMAGE:     { enabled: false, points: 1,   dailyLimit: 20 },
  LIKE_IMAGE:     { enabled: false, points: 1,   dailyLimit: 10 },
  FAVORITE_IMAGE: { enabled: false, points: 2,   dailyLimit: 10 },
  COMMENT_IMAGE:  { enabled: false, points: 3,   dailyLimit: 5 },
};

let cachedRules: PointsRulesConfig | null = null;
let cachedAt = 0;
const CACHE_TTL = 60_000; // 1 min in-memory

export function invalidatePointsRulesCache() {
  cachedRules = null;
  cachedAt = 0;
}

async function getPointsRules(): Promise<PointsRulesConfig> {
  if (cachedRules && Date.now() - cachedAt < CACHE_TTL) return cachedRules;

  const config = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: { pointsRules: true },
  });

  const stored = config?.pointsRules as Partial<PointsRulesConfig> | null;
  cachedRules = { ...DEFAULT_POINTS_RULES, ...stored };
  cachedAt = Date.now();
  return cachedRules;
}

/**
 * Returns the Redis key for tracking daily action count.
 * Key expires at midnight UTC+8 (or at end of the user's calendar day).
 */
function dailyKey(userId: string, action: PointsAction): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `pts:${userId}:${action}:${today}`;
}

/**
 * Award points for a user action. Checks rule config and daily limits.
 * Returns the points awarded (0 if rule disabled or limit reached).
 * This function is fire-and-forget safe — errors are logged, not thrown.
 */
export async function awardPoints(
  userId: string,
  action: PointsAction,
  description?: string,
  relatedId?: string
): Promise<number> {
  try {
    const rules = await getPointsRules();
    const rule = rules[action];
    if (!rule?.enabled || rule.points <= 0) return 0;

    // Check daily limit via Redis
    if (rule.dailyLimit > 0) {
      const key = dailyKey(userId, action);
      let count = 0;
      try {
        const val = await redis.get(key);
        count = val ? parseInt(val, 10) : 0;
      } catch {
        // Redis down — skip limit check and allow
      }
      if (count >= rule.dailyLimit) return 0;
    }

    // Atomically increment user points and create transaction
    const user = await prisma.user.update({
      where: { id: userId },
      data: { points: { increment: rule.points } },
      select: { points: true },
    });

    await prisma.pointsTransaction.create({
      data: {
        userId,
        amount: rule.points,
        balance: user.points,
        type: action as PointsTransactionType,
        description: description || ACTION_LABELS[action],
        relatedId: relatedId || null,
      },
    });

    // Increment Redis daily counter
    if (rule.dailyLimit > 0) {
      const key = dailyKey(userId, action);
      try {
        const pipe = redis.pipeline();
        pipe.incr(key);
        pipe.expire(key, 86400); // 24h TTL as safety net
        await pipe.exec();
      } catch {
        // Redis down — counter will be lost, acceptable tradeoff
      }
    }

    return rule.points;
  } catch (err) {
    console.error(`[Points] awardPoints(${userId}, ${action}) error:`, err);
    return 0;
  }
}

/**
 * Check daily login and award points if not yet claimed today.
 */
export async function awardDailyLogin(userId: string): Promise<number> {
  return awardPoints(userId, "DAILY_LOGIN");
}
