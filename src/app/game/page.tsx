import { prisma } from "@/lib/prisma";
import { GameListClient } from "./client";
import { cache } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "游戏 - Mikiacg",
  description: "发现精选 ACGN 游戏，免费下载各种 ADV、SLG、RPG、ACT 类型游戏",
  keywords: ["ACGN", "游戏", "ADV", "SLG", "RPG", "免费游戏", "galgame"],
};

const getInitialData = cache(async () => {
  const [tags, games, typeStats] = await Promise.all([
    // 获取热门游戏标签
    prisma.tag.findMany({
      where: {
        games: { some: { game: { status: "PUBLISHED" } } },
      },
      take: 30,
      orderBy: { games: { _count: "desc" } },
      select: { id: true, name: true, slug: true },
    }),
    // 获取最新游戏（首屏数据）
    prisma.game.findMany({
      take: 20,
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: {
          select: { id: true, username: true, nickname: true, avatar: true },
        },
        tags: {
          include: { tag: { select: { id: true, name: true, slug: true } } },
        },
        _count: { select: { likes: true, dislikes: true, favorites: true } },
      },
    }),
    // 获取游戏类型统计
    prisma.game.groupBy({
      by: ["gameType"],
      where: { status: "PUBLISHED" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return {
    tags,
    games,
    typeStats: typeStats.map((s) => ({
      type: s.gameType || "OTHER",
      count: s._count.id,
    })),
  };
});

function serializeGames(games: Awaited<ReturnType<typeof getInitialData>>["games"]) {
  return games.map((game) => ({
    id: game.id,
    title: game.title,
    description: game.description,
    coverUrl: game.coverUrl,
    gameType: game.gameType,
    isFree: game.isFree,
    version: game.version,
    views: game.views,
    createdAt: game.createdAt.toISOString(),
    extraInfo: game.extraInfo,
    uploader: game.uploader,
    tags: game.tags,
    _count: game._count,
  }));
}

export default async function GameListPage() {
  const { tags, games, typeStats } = await getInitialData();
  const serializedGames = serializeGames(games);

  return (
    <GameListClient
      initialTags={tags}
      initialGames={serializedGames}
      typeStats={typeStats}
    />
  );
}
