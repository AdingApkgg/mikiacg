import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { redis, REDIS_AVAILABLE } from "@/lib/redis";
import { getPublicSiteConfig } from "@/lib/site-config";
import { CompositeClient } from "@/components/composite/composite-client";
import type { Metadata } from "next";

/** 综合页是否隐藏 NSFW 内容的 cookie 名；值 "1" = 隐藏，缺省或其它值 = 展示。 */
const NSFW_COOKIE = "composite-hide-nsfw";

// 首页聚合数据缓存窗口。综合首页并行拉取最新与热门内容，不缓存时 TTFB 可达 1.5s+。这里两层缓存：
// - L1：进程内 Map（10s）—— 高频请求快路径，避免每次都打 Redis
// - L2：Redis（60s）—— 跨进程共享，多机部署也能受益
// 失效策略：自然 TTL 过期。内容站短时间内容变化对首页推荐影响有限，60s 可接受。
const HOME_CACHE_TTL_SEC = 60;
const HOME_MEMORY_TTL_MS = 10_000;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  const description = config.siteDescription || `${config.siteName} - 发现最新 ACGN 视频与游戏内容`;
  return {
    title: `${config.siteName} - ${description}`,
    description,
    alternates: {
      canonical: config.siteUrl,
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: config.siteName,
      url: config.siteUrl,
      title: `${config.siteName} - ${description}`,
      description,
    },
  };
}

// 综合页用到的全部查询参数集中在这里，方便后续按需调整窗口期 / 每段条数
const HOT_WINDOW_DAYS = 30;
const LATEST_VIDEO_COUNT = 12;
const LATEST_IMAGE_COUNT = 8;
const LATEST_GAME_COUNT = 8;
const WEEKLY_TOP_COUNT = 10;

/**
 * 综合分区首屏数据：每类各取若干条最新 + 本月热门，SSR 直出避免空骨架闪烁。
 * 单分区被关闭时跳过该类型的查询，对应 section 在客户端也不渲染。
 * `hideNsfw` 来自 cookie，控制是否在所有查询里附加 `isNsfw: false`。
 */
const getInitialData = cache(async (hideNsfw: boolean) => {
  const cfg = await getPublicSiteConfig();
  const hotSince = new Date(Date.now() - HOT_WINDOW_DAYS * 86400_000);
  const nsfwFilter = hideNsfw ? { isNsfw: false } : {};

  const videoInclude = {
    uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
    tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
    _count: { select: { likes: true, dislikes: true, favorites: true } },
  } as const;
  const imageInclude = {
    uploader: { select: { id: true, username: true, nickname: true, avatar: true } },
    tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
  } as const;
  const gameInclude = videoInclude;

  const [videos, images, games, hotVideos, hotImages, hotGames] = await Promise.all([
    // 最新视频（横向滚动）
    cfg.sectionVideoEnabled
      ? prisma.video.findMany({
          take: LATEST_VIDEO_COUNT,
          where: { status: "PUBLISHED", ...nsfwFilter },
          orderBy: { createdAt: "desc" },
          include: videoInclude,
        })
      : Promise.resolve([]),
    // 最新图集（瀑布流）
    cfg.sectionImageEnabled
      ? prisma.imagePost.findMany({
          take: LATEST_IMAGE_COUNT,
          where: { status: "PUBLISHED", ...nsfwFilter },
          orderBy: { createdAt: "desc" },
          include: imageInclude,
        })
      : Promise.resolve([]),
    // 最新游戏
    cfg.sectionGameEnabled
      ? prisma.game.findMany({
          take: LATEST_GAME_COUNT,
          where: { status: "PUBLISHED", ...nsfwFilter },
          orderBy: { createdAt: "desc" },
          include: gameInclude,
        })
      : Promise.resolve([]),
    // 本月热门视频（hero 用第 1 名，混合热门用 2-5 名，本周排行用全部 10）
    cfg.sectionVideoEnabled
      ? prisma.video.findMany({
          take: WEEKLY_TOP_COUNT,
          where: { status: "PUBLISHED", createdAt: { gte: hotSince }, ...nsfwFilter },
          orderBy: { views: "desc" },
          include: videoInclude,
        })
      : Promise.resolve([]),
    cfg.sectionImageEnabled
      ? prisma.imagePost.findMany({
          take: WEEKLY_TOP_COUNT,
          where: { status: "PUBLISHED", createdAt: { gte: hotSince }, ...nsfwFilter },
          orderBy: { views: "desc" },
          include: imageInclude,
        })
      : Promise.resolve([]),
    cfg.sectionGameEnabled
      ? prisma.game.findMany({
          take: WEEKLY_TOP_COUNT,
          where: { status: "PUBLISHED", createdAt: { gte: hotSince }, ...nsfwFilter },
          orderBy: { views: "desc" },
          include: gameInclude,
        })
      : Promise.resolve([]),
  ]);

  return { videos, images, games, hotVideos, hotImages, hotGames };
});

function serializeVideos(videos: Awaited<ReturnType<typeof getInitialData>>["videos"]) {
  return videos.map((v) => ({
    id: v.id,
    title: v.title,
    coverUrl: v.coverUrl,
    coverBlurHash: v.coverBlurHash,
    duration: v.duration,
    views: v.views,
    isNsfw: v.isNsfw,
    createdAt: v.createdAt.toISOString(),
    extraInfo: v.extraInfo,
    uploader: v.uploader,
    tags: v.tags,
    _count: v._count,
  }));
}

function serializeImages(images: Awaited<ReturnType<typeof getInitialData>>["images"]) {
  return images.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    images: p.images as string[],
    views: p.views,
    isNsfw: p.isNsfw,
    createdAt: p.createdAt.toISOString(),
    uploader: p.uploader,
    tags: p.tags,
  }));
}

function serializeGames(games: Awaited<ReturnType<typeof getInitialData>>["games"]) {
  return games.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    coverUrl: g.coverUrl,
    gameType: g.gameType,
    isFree: g.isFree,
    version: g.version,
    views: g.views,
    isNsfw: g.isNsfw,
    createdAt: g.createdAt.toISOString(),
    extraInfo: g.extraInfo,
    uploader: g.uploader,
    tags: g.tags,
    _count: g._count,
  }));
}

/** 首页缓存载荷：所有传给 CompositeClient 的 props，全部已序列化为 JSON 安全结构 */
interface SerializedHomeData {
  initialVideos: ReturnType<typeof serializeVideos>;
  initialImages: ReturnType<typeof serializeImages>;
  initialGames: ReturnType<typeof serializeGames>;
  hotVideos: ReturnType<typeof serializeVideos>;
  hotImages: ReturnType<typeof serializeImages>;
  hotGames: ReturnType<typeof serializeGames>;
}

/** L1：进程内缓存 + singleflight，挂在 globalThis 上跨 dev 热重载保持 */
const homeCacheStore = globalThis as unknown as {
  __homeMemCache?: Map<string, { data: SerializedHomeData; expires: number }>;
  __homeMemInflight?: Map<string, Promise<SerializedHomeData>>;
};
homeCacheStore.__homeMemCache ??= new Map();
homeCacheStore.__homeMemInflight ??= new Map();

/** 把原始 Prisma 结果序列化为 CompositeClient 直接可用的 props（Date → ISO 字符串等）。 */
async function fetchAndSerializeHomeData(hideNsfw: boolean): Promise<SerializedHomeData> {
  const raw = await getInitialData(hideNsfw);
  return {
    initialVideos: serializeVideos(raw.videos),
    initialImages: serializeImages(raw.images),
    initialGames: serializeGames(raw.games),
    hotVideos: serializeVideos(raw.hotVideos),
    hotImages: serializeImages(raw.hotImages),
    hotGames: serializeGames(raw.hotGames),
  };
}

/**
 * 带两层缓存的首页数据获取。命中顺序：L1 进程内 → L2 Redis → DB。
 * 同进程并发请求通过 inflight Map 合并，避免雪崩。Redis 故障静默降级（仅走 L1 + DB）。
 */
async function getCachedHomeData(hideNsfw: boolean): Promise<SerializedHomeData> {
  const memKey = hideNsfw ? "1" : "0";
  const redisKey = `home:composite:v2:${memKey}`;
  const now = Date.now();

  // L1
  const mem = homeCacheStore.__homeMemCache!.get(memKey);
  if (mem && mem.expires > now) return mem.data;

  // 同进程 singleflight
  const inflight = homeCacheStore.__homeMemInflight!.get(memKey);
  if (inflight) return inflight;

  const promise = (async (): Promise<SerializedHomeData> => {
    // L2
    if (REDIS_AVAILABLE) {
      try {
        const cached = await redis.get(redisKey);
        if (cached) {
          const data = JSON.parse(cached) as SerializedHomeData;
          homeCacheStore.__homeMemCache!.set(memKey, { data, expires: now + HOME_MEMORY_TTL_MS });
          return data;
        }
      } catch {
        // 静默降级到 DB
      }
    }

    // miss → DB
    const data = await fetchAndSerializeHomeData(hideNsfw);
    homeCacheStore.__homeMemCache!.set(memKey, { data, expires: now + HOME_MEMORY_TTL_MS });
    if (REDIS_AVAILABLE) {
      // 写 Redis 不阻塞返回（命中失败也不影响主流程）
      redis.set(redisKey, JSON.stringify(data), "EX", HOME_CACHE_TTL_SEC).catch(() => {});
    }
    return data;
  })();

  homeCacheStore.__homeMemInflight!.set(memKey, promise);
  try {
    return await promise;
  } finally {
    homeCacheStore.__homeMemInflight!.delete(memKey);
  }
}

/**
 * 站点首页 `/` —— 综合分区开启时直接渲染聚合首页；
 * 关闭时按 视频 → 图片 → 游戏 顺序跳到第一个启用的分区。
 */
export default async function HomePage() {
  const cfg = await getPublicSiteConfig();
  if (!cfg.sectionCompositeEnabled) {
    if (cfg.sectionVideoEnabled !== false) redirect("/video");
    if (cfg.sectionImageEnabled !== false) redirect("/image");
    if (cfg.sectionGameEnabled !== false) redirect("/game");
    redirect("/video");
  }

  const cookieStore = await cookies();
  const hideNsfw = cookieStore.get(NSFW_COOKIE)?.value === "1";

  const data = await getCachedHomeData(hideNsfw);

  return (
    <CompositeClient
      initialVideos={data.initialVideos}
      initialImages={data.initialImages}
      initialGames={data.initialGames}
      hotVideos={data.hotVideos}
      hotImages={data.hotImages}
      hotGames={data.hotGames}
    />
  );
}
