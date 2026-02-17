import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { GameTagPageClient } from "./client";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";
import { cache } from "react";

interface GameTagPageProps {
  params: Promise<{ slug: string }>;
}

const getTag = cache(async (slug: string) => {
  return prisma.tag.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: { games: true },
      },
    },
  });
});

export async function generateStaticParams() {
  const popularTags = await prisma.tag.findMany({
    where: { games: { some: { game: { status: "PUBLISHED" } } } },
    take: 50,
    orderBy: { games: { _count: "desc" } },
    select: { slug: true },
  });

  return popularTags.map((tag) => ({ slug: tag.slug }));
}

export async function generateMetadata({
  params,
}: GameTagPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const tag = await getTag(slug);

  if (!tag) {
    return {
      title: "标签不存在",
      description: "该标签可能已被删除或不存在",
    };
  }

  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "Mikiacg";
  const description = `浏览 ${tag.name} 标签下的 ${tag._count.games} 个游戏`;

  return {
    title: `#${tag.name} - 游戏`,
    description,
    keywords: [tag.name, "ACGN", "游戏", "标签"],
    openGraph: {
      type: "website",
      title: `#${tag.name} 游戏 - ${siteName}`,
      description,
    },
    twitter: {
      card: "summary",
      title: `#${tag.name} 游戏 - ${siteName}`,
      description,
    },
  };
}

function serializeTag(tag: NonNullable<Awaited<ReturnType<typeof getTag>>>) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    _count: tag._count,
  };
}

export type SerializedGameTag = ReturnType<typeof serializeTag>;

export default async function GameTagPage({ params }: GameTagPageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const tag = await getTag(slug);

  const initialTag = tag ? serializeTag(tag) : null;
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "Mikiacg";
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://acgn.app";

  return (
    <>
      {tag && (
        <CollectionPageJsonLd
          name={`#${tag.name} 游戏 - ${siteName}`}
          description={`浏览 ${tag.name} 标签下的 ${tag._count.games} 个游戏`}
          url={`${siteUrl}/game/tag/${tag.slug}`}
          numberOfItems={tag._count.games}
        />
      )}
      <GameTagPageClient slug={slug} initialTag={initialTag} />
    </>
  );
}
