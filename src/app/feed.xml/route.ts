import { prisma } from "@/lib/prisma";
import { getCoverFullUrl } from "@/lib/cover";
import { getPublicSiteConfig } from "@/lib/site-config";
import {
  gamePublicationOrderBy,
  imagePublicationOrderBy,
  publicationDate,
  videoPublicationOrderBy,
} from "@/lib/publication";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getPublicSiteConfig();
  const baseUrl = config.siteUrl;
  const siteName = config.siteName;

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  let rssItems = "";

  try {
    const [videos, games, images] = await Promise.all([
      prisma.video.findMany({
        where: { status: "PUBLISHED" },
        orderBy: videoPublicationOrderBy,
        take: 50,
        include: {
          uploader: { select: { username: true, nickname: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
      }),
      prisma.game.findMany({
        where: { status: "PUBLISHED" },
        orderBy: gamePublicationOrderBy,
        take: 30,
        include: {
          uploader: { select: { username: true, nickname: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
      }),
      prisma.imagePost.findMany({
        where: { status: "PUBLISHED" },
        orderBy: imagePublicationOrderBy,
        take: 30,
        include: {
          uploader: { select: { username: true, nickname: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
      }),
    ]);

    // 视频 items
    const videoItems = videos.map(
      (video) => `
    <item>
      <title>${escapeXml(video.title)}</title>
      <link>${baseUrl}/video/${video.id}</link>
      <guid isPermaLink="true">${baseUrl}/video/${video.id}</guid>
      <description><![CDATA[${video.description || video.title}]]></description>
      <pubDate>${publicationDate(video).toUTCString()}</pubDate>
      <author>${escapeXml(video.uploader.nickname || video.uploader.username)}</author>
      ${video.tags.map((t) => `<category>${escapeXml(t.tag.name)}</category>`).join("\n      ")}
      <media:thumbnail url="${escapeXml(getCoverFullUrl(video.id, video.coverUrl))}" />
      <media:content url="${escapeXml(video.videoUrl)}" type="video/mp4" medium="video"${video.duration ? ` duration="${video.duration}"` : ""}>
        <media:title type="plain">${escapeXml(video.title)}</media:title>
        <media:description type="plain"><![CDATA[${video.description || ""}]]></media:description>
        <media:thumbnail url="${escapeXml(getCoverFullUrl(video.id, video.coverUrl))}" />
        <media:credit role="author">${escapeXml(video.uploader.nickname || video.uploader.username)}</media:credit>
        <media:statistics views="${video.views}" />
      </media:content>
      ${video.duration ? `<itunes:duration>${formatDuration(video.duration)}</itunes:duration>` : ""}
    </item>`,
    );

    // 游戏 items
    const gameItems = games.map((game) => {
      const typeLabel = game.gameType ? `[${game.gameType}] ` : "";
      const freeLabel = game.isFree ? "" : " [付费]";
      const coverUrl = game.coverUrl ? escapeXml(game.coverUrl) : `${baseUrl}/icon`;

      return `
    <item>
      <title>${escapeXml(`${typeLabel}${game.title}${freeLabel}`)}</title>
      <link>${baseUrl}/game/${game.id}</link>
      <guid isPermaLink="true">${baseUrl}/game/${game.id}</guid>
      <description><![CDATA[${game.description || game.title}]]></description>
      <pubDate>${publicationDate(game).toUTCString()}</pubDate>
      <author>${escapeXml(game.uploader.nickname || game.uploader.username)}</author>
      <category>游戏</category>
      ${game.tags.map((t) => `<category>${escapeXml(t.tag.name)}</category>`).join("\n      ")}
      <media:thumbnail url="${coverUrl}" />
    </item>`;
    });

    // 图片 items
    const imageItems = images.map((image) => {
      const imageUrls = image.images as string[];
      const thumbUrl =
        imageUrls.length > 0
          ? escapeXml(imageUrls[0].startsWith("http") ? imageUrls[0] : `${baseUrl}${imageUrls[0]}`)
          : `${baseUrl}/icon`;

      return `
    <item>
      <title>${escapeXml(`[图片] ${image.title}`)}</title>
      <link>${baseUrl}/image/${image.id}</link>
      <guid isPermaLink="true">${baseUrl}/image/${image.id}</guid>
      <description><![CDATA[${image.description || image.title}（共 ${imageUrls.length} 张图片）]]></description>
      <pubDate>${publicationDate(image).toUTCString()}</pubDate>
      <author>${escapeXml(image.uploader.nickname || image.uploader.username)}</author>
      <category>图片</category>
      ${image.tags.map((t) => `<category>${escapeXml(t.tag.name)}</category>`).join("\n      ")}
      <media:thumbnail url="${thumbUrl}" />
    </item>`;
    });

    // 按时间混合排序
    interface FeedItem {
      xml: string;
      date: Date;
    }
    const allItems: FeedItem[] = [
      ...videoItems.map((xml, i) => ({ xml, date: publicationDate(videos[i]) })),
      ...gameItems.map((xml, i) => ({ xml, date: publicationDate(games[i]) })),
      ...imageItems.map((xml, i) => ({ xml, date: publicationDate(images[i]) })),
    ];
    allItems.sort((a, b) => b.date.getTime() - a.date.getTime());

    rssItems = allItems.map((item) => item.xml).join("");
  } catch {
    console.warn("Feed: Database unavailable, returning empty feed");
  }

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${baseUrl}</link>
    <description>${siteName} - ACGN 流式媒体内容分享平台，分享动画、漫画、游戏、轻小说相关视频、游戏资源和图片</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${baseUrl}/icon</url>
      <title>${escapeXml(siteName)}</title>
      <link>${baseUrl}</link>
    </image>
    <itunes:author>${escapeXml(siteName)}</itunes:author>
    <itunes:summary>${siteName} - ACGN 流式媒体内容分享平台</itunes:summary>
    <itunes:category text="Leisure">
      <itunes:category text="Animation &amp; Manga"/>
    </itunes:category>
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
