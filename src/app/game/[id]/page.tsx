import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GamePageClient } from "./client";
import { cache, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface GamePageProps {
  params: Promise<{ id: string }>;
}

const getGame = cache(async (id: string) => {
  return prisma.game.findUnique({
    where: { id },
    include: {
      uploader: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatar: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      _count: {
        select: {
          likes: true,
          dislikes: true,
          favorites: true,
          comments: true,
        },
      },
    },
  });
});

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { id } = await params;
  const game = await getGame(id);

  if (!game) {
    return {
      title: "游戏不存在",
      description: "该游戏可能已被删除或不存在",
    };
  }

  const uploaderName = game.uploader.nickname || game.uploader.username;
  const description = game.description
    ? game.description.slice(0, 160)
    : `${uploaderName} 分享的游戏`;
  const keywords = game.tags.map(({ tag }) => tag.name);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.mikiacg.vip";

  return {
    title: game.title,
    description,
    keywords: ["ACGN", "游戏", game.gameType || "", ...keywords].filter(Boolean),
    authors: [{ name: uploaderName }],
    openGraph: {
      type: "website",
      title: game.title,
      description,
      url: `${baseUrl}/game/${id}`,
      ...(game.coverUrl && {
        images: [
          {
            url: game.coverUrl.startsWith("http") ? game.coverUrl : `${baseUrl}${game.coverUrl}`,
            width: 600,
            height: 800,
            alt: game.title,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: game.title,
      description,
    },
  };
}

/** 游戏 extraInfo 类型定义 */
export interface GameExtraInfo {
  originalName?: string;
  originalAuthor?: string;
  authorUrl?: string;
  fileSize?: string;
  platforms?: string[];
  screenshots?: string[];
  /** 游戏预览视频（mp4 / m3u8 等） */
  videos?: string[];
  characterIntro?: string;
  downloads?: { name: string; url: string; password?: string }[];
  keywords?: string[];
  notices?: { type: "info" | "success" | "warning" | "error"; content: string }[];
}

function serializeGame(game: NonNullable<Awaited<ReturnType<typeof getGame>>>) {
  return {
    id: game.id,
    title: game.title,
    description: game.description,
    coverUrl: game.coverUrl,
    gameType: game.gameType,
    isFree: game.isFree,
    version: game.version,
    views: game.views,
    status: game.status,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    extraInfo: game.extraInfo as GameExtraInfo | null,
    uploader: game.uploader,
    tags: game.tags,
    _count: game._count,
  };
}

export type SerializedGame = ReturnType<typeof serializeGame>;

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params;
  const game = await getGame(id);

  if (!game) {
    notFound();
  }

  const serializedGame = serializeGame(game);

  return (
    <Suspense fallback={<GamePageSkeleton />}>
      <GamePageClient id={id} initialGame={serializedGame} />
    </Suspense>
  );
}

function GamePageSkeleton() {
  return (
    <div className="container py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Skeleton className="aspect-[3/4] w-full rounded-lg" />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
