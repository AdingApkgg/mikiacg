import { prisma } from "@/lib/prisma";
import { gamePublicationDateWhere, imagePublicationDateWhere, videoPublicationDateWhere } from "@/lib/publication";
import { getPublicSiteConfig } from "@/lib/site-config";
import { setRanking } from "./cache";
import { calculateScore, getCombinedQuota, getTopN, getWeights } from "./score";
import type { RankingCategory, RankingContentType, RankingItem, RankingPeriod } from "./types";

/** 内容类型 → DB 模型与外键字段映射 */
const CONTENT_MAP = {
  video: {
    contentDelegate: "video",
    likeDelegate: "like",
    favoriteDelegate: "favorite",
    commentDelegate: "comment",
    fk: "videoId",
  },
  image: {
    contentDelegate: "imagePost",
    likeDelegate: "imagePostLike",
    favoriteDelegate: "imagePostFavorite",
    commentDelegate: "imagePostComment",
    fk: "imagePostId",
  },
  game: {
    contentDelegate: "game",
    likeDelegate: "gameLike",
    favoriteDelegate: "gameFavorite",
    commentDelegate: "gameComment",
    fk: "gameId",
  },
} as const;

type BaseContentType = keyof typeof CONTENT_MAP;

/** 把周期字符串转成毫秒数 */
function periodToMs(period: RankingPeriod): number {
  switch (period) {
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "all":
      return Number.POSITIVE_INFINITY;
  }
}

interface InteractionCounts {
  likes: number;
  favorites: number;
  comments: number;
}

/** 通用 groupBy 互动聚合（参数化表名） */
async function aggregateInteractions(
  type: BaseContentType,
  since: Date | null,
  topN: number,
): Promise<Map<string, InteractionCounts>> {
  const m = CONTENT_MAP[type];
  const where = since ? { createdAt: { gte: since } } : {};
  const sliceSize = Math.max(topN * 5, 200);

  // biome-ignore lint/suspicious/noExplicitAny: Prisma delegate union 类型动态访问
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any;
  const [likeRows, favRows, commentRows] = await Promise.all([
    p[m.likeDelegate].groupBy({
      by: [m.fk],
      where,
      _count: { _all: true },
      orderBy: { _count: { [m.fk]: "desc" } },
      take: sliceSize,
    }),
    p[m.favoriteDelegate].groupBy({
      by: [m.fk],
      where,
      _count: { _all: true },
      orderBy: { _count: { [m.fk]: "desc" } },
      take: sliceSize,
    }),
    p[m.commentDelegate].groupBy({
      by: [m.fk],
      where,
      _count: { _all: true },
      orderBy: { _count: { [m.fk]: "desc" } },
      take: sliceSize,
    }),
  ]);

  const map = new Map<string, InteractionCounts>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) {
      v = { likes: 0, favorites: 0, comments: 0 };
      map.set(id, v);
    }
    return v;
  };
  for (const r of likeRows) get(r[m.fk]).likes = r._count._all;
  for (const r of favRows) get(r[m.fk]).favorites = r._count._all;
  for (const r of commentRows) get(r[m.fk]).comments = r._count._all;
  return map;
}

/** 通用 score 榜（视频/图集/游戏） */
export async function computeScoreRanking(type: BaseContentType, period: RankingPeriod): Promise<RankingItem[]> {
  const config = await getPublicSiteConfig();
  const weights = getWeights(config);
  const topN = getTopN(config);

  const sinceMs = periodToMs(period);
  const since = Number.isFinite(sinceMs) ? new Date(Date.now() - sinceMs) : null;

  const interactions = await aggregateInteractions(type, since, topN);
  if (interactions.size === 0) return [];

  const viewDecay = period === "1d" ? 0.05 : period === "7d" ? 0.2 : period === "30d" ? 0.5 : 1;

  const ids = Array.from(interactions.keys());
  const m = CONTENT_MAP[type];
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Array<{ id: string; views: number }> = await (prisma as any)[m.contentDelegate].findMany({
    where: { id: { in: ids }, status: "PUBLISHED" },
    select: { id: true, views: true },
  });

  const scored: RankingItem[] = rows.map((r) => {
    const c = interactions.get(r.id) ?? { likes: 0, favorites: 0, comments: 0 };
    const score = calculateScore(
      { views: r.views * viewDecay, likes: c.likes, favorites: c.favorites, comments: c.comments },
      weights,
    );
    return { id: r.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/** 通用飙升榜（当前 24h - 前 24h 加权分） */
export async function computeSurgeRanking(type: BaseContentType): Promise<RankingItem[]> {
  const config = await getPublicSiteConfig();
  const weights = getWeights(config);
  const topN = getTopN(config);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since24 = new Date(now - day);
  const since48 = new Date(now - 2 * day);

  const [currentWindow, fullWindow] = await Promise.all([
    aggregateInteractions(type, since24, topN),
    aggregateInteractions(type, since48, topN),
  ]);

  const ids = new Set<string>([...currentWindow.keys(), ...fullWindow.keys()]);
  const scored: RankingItem[] = [];
  for (const id of ids) {
    const cur = currentWindow.get(id) ?? { likes: 0, favorites: 0, comments: 0 };
    const full = fullWindow.get(id) ?? { likes: 0, favorites: 0, comments: 0 };
    const prev = {
      likes: Math.max(0, full.likes - cur.likes),
      favorites: Math.max(0, full.favorites - cur.favorites),
      comments: Math.max(0, full.comments - cur.comments),
    };
    const delta = calculateScore(cur, weights) - calculateScore(prev, weights);
    if (delta > 0) scored.push({ id, score: delta });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/** 周期内新增收藏榜（按 Favorite.createdAt 在窗口内 groupBy） */
export async function computeFavPeriodRanking(type: BaseContentType, period: RankingPeriod): Promise<RankingItem[]> {
  const topN = getTopN(await getPublicSiteConfig());
  const sinceMs = periodToMs(period);
  const since = Number.isFinite(sinceMs) ? new Date(Date.now() - sinceMs) : null;
  const m = CONTENT_MAP[type];
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Array<Record<string, unknown>> = await (prisma as any)[m.favoriteDelegate].groupBy({
    by: [m.fk],
    where: since ? { createdAt: { gte: since } } : {},
    _count: { _all: true },
    orderBy: { _count: { [m.fk]: "desc" } },
    take: topN,
  });
  return rows.map((r) => ({ id: String(r[m.fk]), score: (r._count as { _all: number })._all }));
}

/** 全站累计收藏榜 */
export async function computeFavTotalRanking(type: BaseContentType): Promise<RankingItem[]> {
  const topN = getTopN(await getPublicSiteConfig());
  const m = CONTENT_MAP[type];
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Array<{ id: string; _count: { favorites: number } }> = await (prisma as any)[m.contentDelegate].findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, _count: { select: { favorites: true } } },
    orderBy: { favorites: { _count: "desc" } },
    take: topN,
  });
  return rows.map((r) => ({ id: r.id, score: r._count.favorites }));
}

/**
 * 综合榜：调用 video/image/game 各自的 score 榜，按 combinedQuota 各取 N 条，
 * 按各类型内的归一化分数（score / max）二次排序混排。
 *
 * 返回的 id 编码为 "{type}:{id}"，前端按前缀拆分。
 */
export async function computeCombinedRanking(period: RankingPeriod): Promise<RankingItem[]> {
  const config = await getPublicSiteConfig();
  const quota = getCombinedQuota(config);

  const [videoTop, imageTop, gameTop] = await Promise.all([
    computeScoreRanking("video", period),
    computeScoreRanking("image", period),
    computeScoreRanking("game", period),
  ]);

  const normalize = (items: RankingItem[], take: number, prefix: BaseContentType): RankingItem[] => {
    if (items.length === 0) return [];
    const max = items[0].score || 1;
    return items.slice(0, take).map((it) => ({ id: `${prefix}:${it.id}`, score: it.score / max }));
  };

  const merged: RankingItem[] = [
    ...normalize(videoTop, quota.video, "video"),
    ...normalize(imageTop, quota.image, "image"),
    ...normalize(gameTop, quota.game, "game"),
  ];
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

/** 热门标签榜：按 Tag 表已有的 videoCount + gameCount + imagePostCount 总和排序 */
export async function computeTagHotRanking(): Promise<RankingItem[]> {
  const topN = getTopN(await getPublicSiteConfig());
  const tags = await prisma.tag.findMany({
    select: { id: true, videoCount: true, gameCount: true, imagePostCount: true },
    take: topN * 3,
  });
  const scored: RankingItem[] = tags
    .map((t) => ({ id: t.id, score: t.videoCount + t.gameCount + t.imagePostCount }))
    .filter((t) => t.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/**
 * 增长最快标签榜（代理算法）：
 *
 * 标签没有独立的发布时间，无法精确统计标签被打次数的增量。改用代理：
 * 当前 24h 内新发布的视频/图集/游戏所携带的标签计数 − 前 24h 同期计数。
 * 语义≈"近期新内容里出现频次的环比增量"。
 */
export async function computeTagSurgeRanking(): Promise<RankingItem[]> {
  const topN = getTopN(await getPublicSiteConfig());
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since24 = new Date(now - day);
  const since48 = new Date(now - 2 * day);

  const collect = async (since: Date): Promise<Map<string, number>> => {
    const [v, g, i] = await Promise.all([
      prisma.tagOnVideo.findMany({
        where: { video: { status: "PUBLISHED", ...videoPublicationDateWhere({ gte: since }) } },
        select: { tagId: true },
      }),
      prisma.tagOnGame.findMany({
        where: { game: { status: "PUBLISHED", ...gamePublicationDateWhere({ gte: since }) } },
        select: { tagId: true },
      }),
      prisma.tagOnImagePost.findMany({
        where: { imagePost: { status: "PUBLISHED", ...imagePublicationDateWhere({ gte: since }) } },
        select: { tagId: true },
      }),
    ]);
    const map = new Map<string, number>();
    for (const { tagId } of [...v, ...g, ...i]) {
      map.set(tagId, (map.get(tagId) ?? 0) + 1);
    }
    return map;
  };

  const [current, full] = await Promise.all([collect(since24), collect(since48)]);
  const tagIds = new Set<string>([...current.keys(), ...full.keys()]);
  const scored: RankingItem[] = [];
  for (const id of tagIds) {
    const cur = current.get(id) ?? 0;
    const prev = Math.max(0, (full.get(id) ?? 0) - cur);
    const delta = cur - prev;
    if (delta > 0) scored.push({ id, score: delta });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

/** 写榜单到 Redis + 落快照 */
export async function persistRanking(
  contentType: RankingContentType,
  category: RankingCategory,
  period: RankingPeriod,
  items: RankingItem[],
): Promise<void> {
  await setRanking(contentType, category, period, items);
  await prisma.rankingSnapshot.create({
    data: {
      category,
      contentType,
      period,
      items: items.map((it, i) => ({ id: it.id, score: it.score, rank: i + 1 })),
    },
  });
}
