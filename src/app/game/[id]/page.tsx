import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GamePageClient } from "./client";
import { cache, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicSiteConfig } from "@/lib/site-config";
import { MdxContent } from "@/components/mdx/mdx-remote";
import { VideoGameJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";

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
      versions: {
        orderBy: { sortOrder: "asc" as const },
      },
      customTabs: {
        orderBy: { sortOrder: "asc" as const },
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
  const description = game.description ? game.description.slice(0, 160) : `${uploaderName} 分享的游戏`;
  const keywords = game.tags.map(({ tag }) => tag.name);

  const siteConfig = await getPublicSiteConfig();
  const baseUrl = siteConfig.siteUrl;

  return {
    title: game.title,
    description,
    keywords: ["ACGN", "游戏", game.gameType || "", ...keywords].filter(Boolean),
    authors: [{ name: uploaderName }],
    alternates: {
      canonical: `${baseUrl}/game/${id}`,
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: siteConfig.siteName,
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
      ...(game.coverUrl && {
        images: [game.coverUrl.startsWith("http") ? game.coverUrl : `${baseUrl}${game.coverUrl}`],
      }),
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
    downloads: game.downloads,
    isNsfw: game.isNsfw,
    status: game.status,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    publishedAt: game.publishedAt?.toISOString() ?? null,
    extraInfo: game.extraInfo as GameExtraInfo | null,
    uploader: game.uploader,
    tags: game.tags,
    versions: game.versions.map((v) => ({
      id: v.id,
      label: v.label,
      description: v.description,
      sortOrder: v.sortOrder,
    })),
    customTabs: game.customTabs.map((t) => ({
      id: t.id,
      title: t.title,
      icon: t.icon,
      sortOrder: t.sortOrder,
    })),
    _count: game._count,
  };
}

export type SerializedGame = ReturnType<typeof serializeGame>;

export default async function GamePage({ params }: GamePageProps) {
  const siteConfig = await getPublicSiteConfig();
  if (!siteConfig.sectionGameEnabled) notFound();
  const { id } = await params;
  const game = await getGame(id);

  if (!game) {
    notFound();
  }

  const serializedGame = serializeGame(game);
  const extra = game.extraInfo as GameExtraInfo | null;

  const descriptionContent = game.description ? <MdxContent source={game.description} /> : null;
  const characterIntroContent = extra?.characterIntro ? <MdxContent source={extra.characterIntro} /> : null;

  const versionContents = await Promise.all(
    game.versions
      .filter((v) => v.description)
      .map(async (v) => ({
        id: v.id,
        content: <MdxContent source={v.description!} />,
      })),
  );
  const versionContentMap: Record<string, React.ReactNode> = {};
  for (const vc of versionContents) {
    versionContentMap[vc.id] = vc.content;
  }

  const customTabRendered = await Promise.all(
    game.customTabs
      .filter((t) => t.content)
      .map(async (t) => ({
        id: t.id,
        content: <MdxContent source={t.content} />,
      })),
  );
  const customTabContentMap: Record<string, React.ReactNode> = {};
  for (const ct of customTabRendered) {
    customTabContentMap[ct.id] = ct.content;
  }

  const baseUrl = siteConfig.siteUrl;

  return (
    <>
      {/* SEO 结构化数据 - SSR 输出供搜索引擎首次抓取 */}
      <VideoGameJsonLd game={game} baseUrl={baseUrl} />
      <BreadcrumbJsonLd
        items={[
          { name: "首页", url: baseUrl },
          { name: "游戏", url: `${baseUrl}/game` },
          { name: game.title, url: `${baseUrl}/game/${id}` },
        ]}
      />
      <Suspense fallback={<GamePageSkeleton />}>
        <GamePageClient
          id={id}
          initialGame={serializedGame}
          descriptionContent={descriptionContent}
          characterIntroContent={characterIntroContent}
          versionContents={versionContentMap}
          customTabContents={customTabContentMap}
        />
      </Suspense>
    </>
  );
}

function GamePageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
      <Skeleton className="h-5 w-28 mb-4" />

      {/* Cover */}
      <Skeleton className="aspect-video w-full max-w-4xl mx-auto rounded-xl" />

      {/* Title + stats */}
      <div className="max-w-4xl mx-auto mt-5 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
      </div>

      {/* Two-column content */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mt-6">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-28 w-full rounded-lg" />
          <div className="flex gap-4 border-b pb-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="lg:w-[280px] xl:w-[300px] shrink-0 space-y-4">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
