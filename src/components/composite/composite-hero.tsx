"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Play, Images, Gamepad2, Flame, Eye, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatViews } from "@/lib/format";
import { useThumb } from "@/hooks/use-thumb";
import { useSiteConfig } from "@/contexts/site-config";
import { DEFAULT_THUMBNAIL_PRESETS, getVideoCoverThumbUrl } from "@/lib/thumbnail-presets";
import { MediaCoverSkeleton } from "@/components/shared/media-cover-skeleton";

interface VideoItem {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  views: number;
  uploader: { id: string; username: string; nickname?: string | null };
}
interface ImageItem {
  id: string;
  title: string;
  description?: string | null;
  // Prisma JSON 列，运行时为 string[]，在使用处再做断言
  images: unknown;
  views: number;
  uploader: { id: string; username: string; nickname?: string | null };
}
interface GameItem {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  views: number;
  uploader: { id: string; username: string; nickname?: string | null };
}

interface CompositeHeroProps {
  video?: VideoItem | null;
  image?: ImageItem | null;
  game?: GameItem | null;
}

/**
 * 综合页 Hero 推荐：1 大 + 2 小主次布局。
 * 主位由视图量最高的类型担任，其余两类降级为副位。
 * 任一类型缺数据时该位空缺；三类皆空时 section 不渲染。
 */
export function CompositeHero({ video, image, game }: CompositeHeroProps) {
  const entries: { kind: HeroKind; item: HeroItem }[] = [];
  if (video) entries.push({ kind: "video", item: video });
  if (image) entries.push({ kind: "image", item: image });
  if (game) entries.push({ kind: "game", item: game });
  if (entries.length === 0) return null;

  // 主位：按 views 取最高那个；次/末位保持原顺序去重，保证三类齐全时视频/图集/游戏都有曝光
  const sorted = [...entries].sort((a, b) => b.item.views - a.item.views);
  const main = sorted[0];
  const sides = entries.filter((e) => e.kind !== main.kind);

  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" />
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">本月热门推荐</h2>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HeroCard kind={main.kind} item={main.item} size="lg" />
        </div>
        {sides.length > 0 && (
          <div className="flex flex-col gap-3 sm:gap-4">
            {sides.map(({ kind, item }) => (
              <HeroCard key={`${kind}-${item.id}`} kind={kind} item={item} size="sm" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type HeroKind = "video" | "image" | "game";
type HeroItem = VideoItem | ImageItem | GameItem;
type HeroSize = "lg" | "sm";

const KIND_META: Record<HeroKind, { label: string; icon: LucideIcon; iconClass: string; bg: string }> = {
  video: { label: "视频", icon: Play, iconClass: "text-rose-100", bg: "bg-rose-500/90" },
  image: { label: "图集", icon: Images, iconClass: "text-sky-100", bg: "bg-sky-500/90" },
  game: { label: "游戏", icon: Gamepad2, iconClass: "text-emerald-100", bg: "bg-emerald-500/90" },
};

function HeroCard({ kind, item, size }: { kind: HeroKind; item: HeroItem; size: HeroSize }) {
  const cover = useHeroCover(kind, item, size);
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const href = `/${kind === "image" ? "image" : kind}/${item.id}`;
  const author = item.uploader.nickname || item.uploader.username;
  const isLg = size === "lg";

  return (
    <Link
      href={href}
      className="group relative block aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-sm hover:shadow-xl transition-shadow"
    >
      {cover ? <HeroCover src={cover} alt={item.title} kind={kind} /> : <HeroPlaceholder kind={kind} />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/40" />
      <span
        className={cn(
          "absolute top-2 left-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-semibold backdrop-blur-sm",
          isLg ? "text-sm" : "text-xs",
          meta.bg,
          meta.iconClass,
        )}
      >
        <Icon className={isLg ? "h-4 w-4" : "h-3 w-3"} />
        {meta.label}
      </span>
      <span
        className={cn(
          "absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/55 backdrop-blur-sm px-2 py-0.5 font-semibold text-amber-300",
          isLg ? "text-sm" : "text-xs",
        )}
      >
        <Flame className={isLg ? "h-4 w-4" : "h-3 w-3"} />
        本月热门
      </span>
      <div className={cn("absolute inset-x-0 bottom-0 text-white", isLg ? "p-4 sm:p-5" : "p-3 sm:p-3.5")}>
        <h3
          className={cn("font-bold leading-tight line-clamp-2", isLg ? "text-xl sm:text-2xl" : "text-sm sm:text-base")}
        >
          {item.title}
        </h3>
        {isLg && item.description && <p className="mt-1.5 text-sm text-white/80 line-clamp-2">{item.description}</p>}
        <div className={cn("mt-1.5 flex items-center gap-2 text-white/80", isLg ? "text-sm" : "text-xs")}>
          <span className="truncate">{author}</span>
          <span className="text-white/40">·</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Eye className={isLg ? "h-3.5 w-3.5" : "h-3 w-3"} />
            {formatViews(item.views)}
          </span>
        </div>
      </div>
    </Link>
  );
}

// 封面代理在异步生成期间返回 1×1 占位 GIF（status 202）；用 naturalWidth 判定。
// 间隔覆盖 ffmpeg 抽帧 + CDN 拉取的常见延迟（约 5-10s 内完成），总耗 ~12s 后退到占位。
const RETRY_DELAYS_MS = [1500, 3000, 6000];

function HeroCover({ src, alt, kind }: { src: string; alt: string; kind: HeroKind }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 处理「成功 / 占位 / 失败」三种结果。封装出来供 onLoad 与 useEffect 兜底共用。
  const handleResult = (naturalWidth: number) => {
    if (naturalWidth <= 16) {
      if (attempt < RETRY_DELAYS_MS.length) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS_MS[attempt]);
      } else {
        setErrored(true);
      }
      return;
    }
    setLoaded(true);
  };

  // SSR 场景下浏览器常在 React 绑定 onLoad 前就加载好了图片，事件不再触发，
  // 导致 loaded 永远是 false、骨架/opacity:0 卡住。这里在挂载/重试后兜底检查
  // `img.complete + naturalWidth`，主动同步一次状态。
  useEffect(() => {
    const img = imgRef.current;
    if (!img || loaded || errored) return;
    if (img.complete && img.naturalWidth > 0) {
      handleResult(img.naturalWidth);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // handleResult 闭包包含 attempt，attempt 变化时（重试后新 img）需重新检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, loaded, errored]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    handleResult(e.currentTarget.naturalWidth);
  };

  if (errored) return <HeroPlaceholder kind={kind} />;

  // 用 attempt 做 cache-buster：重试时改 src 强制 img 重新发起请求
  const effectiveSrc = attempt > 0 ? `${src}${src.includes("?") ? "&" : "?"}_r=${attempt}` : src;

  return (
    <>
      {!loaded && <MediaCoverSkeleton />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        key={effectiveSrc}
        src={effectiveSrc}
        alt={alt}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onLoad={handleLoad}
        onError={() => setErrored(true)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </>
  );
}

/** 按类型分别渲染的占位块：填充封面位、跟卡片渐变叠加协调 */
function HeroPlaceholder({ kind }: { kind: HeroKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-primary/5">
      <div className="text-center text-muted-foreground/70">
        <Icon className="mx-auto h-12 w-12" />
        <span className="mt-2 block text-xs font-medium">暂无封面</span>
      </div>
    </div>
  );
}

/**
 * 按类型派发 16:9 hero 缩略图 URL：
 * - 视频：始终走 getVideoCoverThumbUrl，coverUrl 缺失时由代理 `/api/cover/video/{id}`
 *   自动抽帧。代理可能先返 202 + 1×1 占位 GIF，HeroCover 端用 RETRY_DELAYS_MS
 *   重试若干次拉到真实封面。
 * - 图集 / 游戏：无 source URL 时返 null，HeroCard 直接渲染占位块。
 */
function useHeroCover(kind: HeroKind, item: HeroItem, size: HeroSize): string | null {
  const cfg = useSiteConfig();
  const thumb = useThumb("gridPrimary", 16 / 9);
  if (kind === "video") {
    const v = item as VideoItem;
    const preset = cfg?.thumbnailPresets?.gridPrimary ?? DEFAULT_THUMBNAIL_PRESETS.gridPrimary;
    const proxyEnabled = cfg?.coverProxyThumbEnabled !== false;
    const w = size === "lg" ? Math.max(preset.width, 800) : preset.width;
    return getVideoCoverThumbUrl(v.id, v.coverUrl, preset, proxyEnabled, { w, h: Math.round(w / (16 / 9)) });
  }
  if (kind === "image") {
    const p = item as ImageItem;
    const arr = (p.images ?? []) as string[];
    const first = arr[0];
    if (!first) return null;
    return size === "lg" ? thumb(first, { w: 800, h: 450 }) : thumb(first);
  }
  const g = item as GameItem;
  if (!g.coverUrl) return null;
  return size === "lg" ? thumb(g.coverUrl, { w: 800, h: 450 }) : thumb(g.coverUrl);
}
