"use client";

import { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Gamepad2, ThumbsUp, Eye, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { useSound } from "@/hooks/use-sound";
import { useTilt } from "@/hooks/use-tilt";

const GAME_TYPE_LABELS: Record<string, string> = {
  ADV: "ADV", SLG: "SLG", RPG: "RPG", ACT: "ACT",
  STG: "STG", PZL: "PZL", AVG: "AVG", FTG: "FTG",
  TAB: "TAB", OTHER: "其他",
};

const GAME_TYPE_COLORS: Record<string, string> = {
  ADV: "bg-blue-500/80", SLG: "bg-purple-500/80", RPG: "bg-green-500/80",
  ACT: "bg-red-500/80", STG: "bg-orange-500/80", PZL: "bg-cyan-500/80",
  AVG: "bg-indigo-500/80", FTG: "bg-rose-500/80", TAB: "bg-amber-500/80",
  OTHER: "bg-gray-500/80",
};

export interface GameCardData {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  gameType?: string | null;
  isFree?: boolean;
  version?: string | null;
  views: number;
  createdAt: Date | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraInfo?: any;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  tags?: { tag: { id: string; name: string; slug: string } }[];
  _count: {
    likes: number;
    dislikes?: number;
    favorites?: number;
    [key: string]: number | undefined;
  };
}

interface GameCardProps {
  game: GameCardData;
  index?: number;
}

function GameCoverImage({ coverUrl, title }: { coverUrl?: string | null; title: string }) {
  if (coverUrl) {
    const proxyBase = `/api/cover/${encodeURIComponent(coverUrl)}`;
    const src = `${proxyBase}?w=480&h=270&q=60`;

    return (
      <Image
        src={src}
        alt={title}
        fill
        className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform group-hover:scale-105"
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        unoptimized
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-muted to-primary/5 flex items-center justify-center">
      <div className="text-center text-muted-foreground/60">
        <Gamepad2 className="h-10 w-10 mx-auto" />
        <span className="text-xs mt-2 block font-medium">暂无封面</span>
      </div>
    </div>
  );
}

function GameCardComponent({ game, index = 0 }: GameCardProps) {
  const { play } = useSound();
  const { ref: tiltRef, glareRef } = useTilt<HTMLDivElement>({
    maxTilt: 8,
    scale: 1.03,
    glareMaxOpacity: 0.12,
  });

  const extra = game.extraInfo && typeof game.extraInfo === "object" && !Array.isArray(game.extraInfo)
    ? game.extraInfo
    : null;
  const authorName = extra?.originalAuthor || game.uploader.nickname || game.uploader.username;
  const hasDownloads = extra?.downloads && Array.isArray(extra.downloads) && extra.downloads.length > 0;

  const totalVotes = game._count.likes + (game._count.dislikes || 0);
  const likeRatio = totalVotes > 0 ? Math.round((game._count.likes / totalVotes) * 100) : 100;
  const likeColor = likeRatio >= 90 ? "text-green-400" : likeRatio >= 70 ? "text-yellow-400" : "text-red-400";

  return (
    <div
      ref={tiltRef}
      className="group"
      style={{ animationDelay: `${index * 50}ms` }}
      onMouseEnter={() => play("hover")}
    >
      <Link href={`/game/${game.id}`} className="block">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300 ease-out">
          <GameCoverImage coverUrl={game.coverUrl} title={game.title} />

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Hover icon */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-250 ease-out">
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full p-3 shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95">
              <Gamepad2 className="h-5 w-5 text-primary" />
            </div>
          </div>

          {/* Game type badge */}
          {game.gameType && (
            <div className={`absolute top-1.5 left-1.5 ${GAME_TYPE_COLORS[game.gameType] || GAME_TYPE_COLORS.OTHER} backdrop-blur-sm text-white text-[10px] sm:text-xs px-1.5 py-0.5 rounded font-bold`}>
              {GAME_TYPE_LABELS[game.gameType] || game.gameType}
            </div>
          )}

          {game.isFree && (
            <Badge
              variant="secondary"
              className="absolute top-1.5 right-1.5 bg-green-500/80 text-white text-[9px] sm:text-[10px] px-1 py-0 hover:bg-green-500/80 border-0"
            >
              免费
            </Badge>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
            <div className="flex items-center gap-2 text-[10px] sm:text-xs">
              <span className={`flex items-center gap-0.5 ${likeColor}`}>
                <ThumbsUp className="h-3 w-3" />
                {likeRatio}%
              </span>
              <span className="flex items-center gap-0.5 text-white/80">
                <Eye className="h-3 w-3" />
                {formatViews(game.views)}
              </span>
              {hasDownloads && (
                <span className="flex items-center gap-0.5 text-white/80 ml-auto">
                  <Download className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>

          {/* Tilt glare overlay */}
          <div
            ref={glareRef}
            className="absolute inset-0 rounded-lg pointer-events-none opacity-0 transition-opacity duration-300 z-10"
          />
        </div>

        <div className="mt-2 px-0.5 space-y-0.5">
          <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200 ease-out">
            {game.title}
          </h3>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
            {authorName} • {formatRelativeTime(game.createdAt)}
          </p>
        </div>
      </Link>
    </div>
  );
}

export const GameCard = memo(GameCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.game.id === nextProps.game.id &&
    prevProps.game.views === nextProps.game.views &&
    prevProps.game._count.likes === nextProps.game._count.likes &&
    prevProps.index === nextProps.index
  );
});
