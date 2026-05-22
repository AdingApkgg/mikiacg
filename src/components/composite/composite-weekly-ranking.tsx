"use client";

import Link from "next/link";
import { ArrowRight, Play, Images, Gamepad2, Trophy, Eye, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatViews } from "@/lib/format";
import { useThumb } from "@/hooks/use-thumb";
import { useSiteConfig } from "@/contexts/site-config";
import { DEFAULT_THUMBNAIL_PRESETS, getVideoCoverThumbUrl } from "@/lib/thumbnail-presets";

interface BaseItem {
  id: string;
  title: string;
  views: number;
  uploader: { id: string; username: string; nickname?: string | null };
}
interface VideoLite extends BaseItem {
  coverUrl?: string | null;
}
interface ImageLite extends BaseItem {
  // Prisma JSON 列，运行时为 string[]，在使用处再做断言
  images: unknown;
}
interface GameLite extends BaseItem {
  coverUrl?: string | null;
}

interface CompositeWeeklyRankingProps {
  videos: VideoLite[];
  images: ImageLite[];
  games: GameLite[];
}

/**
 * 综合页底部 3 列 mini Top10 排行：分别是本月最高浏览量视频/图集/游戏。
 * 紧凑行（40×40 缩略图 + 标题 1 行 + 作者·浏览量），缩略图原生 lazy。
 */
export function CompositeWeeklyRanking({ videos, images, games }: CompositeWeeklyRankingProps) {
  const cols: { kind: Kind; title: string; icon: LucideIcon; iconClass: string; href: string; items: BaseItem[] }[] =
    [];
  if (videos.length > 0) {
    cols.push({
      kind: "video",
      title: "热门视频",
      icon: Play,
      iconClass: "text-rose-500",
      href: "/video?sortBy=views",
      items: videos,
    });
  }
  if (images.length > 0) {
    cols.push({
      kind: "image",
      title: "热门图集",
      icon: Images,
      iconClass: "text-sky-500",
      href: "/image?sortBy=views",
      items: images,
    });
  }
  if (games.length > 0) {
    cols.push({
      kind: "game",
      title: "热门游戏",
      icon: Gamepad2,
      iconClass: "text-emerald-500",
      href: "/game?sortBy=views",
      items: games,
    });
  }
  if (cols.length === 0) return null;

  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">本月排行</h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {cols.map((col) => (
          <RankingColumn key={col.kind} col={col} />
        ))}
      </div>
    </section>
  );
}

type Kind = "video" | "image" | "game";

function RankingColumn({
  col,
}: {
  col: { kind: Kind; title: string; icon: LucideIcon; iconClass: string; href: string; items: BaseItem[] };
}) {
  const Icon = col.icon;
  return (
    <div className="rounded-xl border bg-card/30 overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4", col.iconClass)} />
          <h3 className="font-semibold text-sm">{col.title}</h3>
        </div>
        <Link
          href={col.href}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          更多
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <ol className="divide-y">
        {col.items.map((item, i) => (
          <RankingRow key={item.id} kind={col.kind} item={item} rank={i + 1} />
        ))}
      </ol>
    </div>
  );
}

function RankingRow({ kind, item, rank }: { kind: Kind; item: BaseItem; rank: number }) {
  const cover = useRowCover(kind, item);
  const href = `/${kind === "image" ? "image" : kind}/${item.id}`;
  const author = item.uploader.nickname || item.uploader.username;
  return (
    <li>
      <Link href={href} className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-accent/40 transition-colors">
        <RankNumber rank={rank} />
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium leading-snug">{item.title}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{author}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-0.5 tabular-nums shrink-0">
              <Eye className="h-3 w-3" />
              {formatViews(item.views)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

/** 排名数字：1/2/3 金银铜，4+ 普通灰色数字 */
function RankNumber({ rank }: { rank: number }) {
  const colorClass =
    rank === 1
      ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm"
      : rank === 2
        ? "bg-gradient-to-br from-zinc-300 to-zinc-500 text-white shadow-sm"
        : rank === 3
          ? "bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold tabular-nums",
        colorClass,
      )}
    >
      {rank}
    </span>
  );
}

function useRowCover(kind: Kind, item: BaseItem): string {
  const cfg = useSiteConfig();
  const thumb = useThumb("microThumb");
  if (kind === "video") {
    const v = item as VideoLite;
    const preset = cfg?.thumbnailPresets?.microThumb ?? DEFAULT_THUMBNAIL_PRESETS.microThumb;
    const proxyEnabled = cfg?.coverProxyThumbEnabled !== false;
    return getVideoCoverThumbUrl(v.id, v.coverUrl, preset, proxyEnabled);
  }
  if (kind === "image") {
    const p = item as ImageLite;
    const arr = (p.images ?? []) as string[];
    return thumb(arr[0] ?? "");
  }
  const g = item as GameLite;
  return thumb(g.coverUrl ?? "");
}
