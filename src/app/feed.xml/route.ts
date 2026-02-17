import { prisma } from "@/lib/prisma";
import { getCoverFullUrl } from "@/lib/cover";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "Mikiacg";

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
    const [videos, games] = await Promise.all([
      prisma.video.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          uploader: { select: { username: true, nickname: true } },
          tags: { include: { tag: { select: { name: true } } } },
        },
      }),
      prisma.game.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
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
      <pubDate>${new Date(video.createdAt).toUTCString()}</pubDate>
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
    </item>`
    );

    // 游戏 items
    const gameItems = games.map((game) => {
      const typeLabel = game.gameType ? `[${game.gameType}] ` : "";
      const freeLabel = game.isFree ? "" : " [付费]";
      const coverUrl = game.coverUrl
        ? escapeXml(game.coverUrl)
        : `${baseUrl}/icon`;

      return `
    <item>
      <title>${escapeXml(`${typeLabel}${game.title}${freeLabel}`)}</title>
      <link>${baseUrl}/game/${game.id}</link>
      <guid isPermaLink="true">${baseUrl}/game/${game.id}</guid>
      <description><![CDATA[${game.description || game.title}]]></description>
      <pubDate>${new Date(game.createdAt).toUTCString()}</pubDate>
      <author>${escapeXml(game.uploader.nickname || game.uploader.username)}</author>
      <category>游戏</category>
      ${game.tags.map((t) => `<category>${escapeXml(t.tag.name)}</category>`).join("\n      ")}
      <media:thumbnail url="${coverUrl}" />
    </item>`;
    });

    // 按时间混合排序
    interface FeedItem {
      xml: string;
      date: Date;
    }
    const allItems: FeedItem[] = [
      ...videoItems.map((xml, i) => ({ xml, date: videos[i].createdAt })),
      ...gameItems.map((xml, i) => ({ xml, date: games[i].createdAt })),
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
    <description>${siteName} - ACGN 流式媒体内容分享平台，分享动画、漫画、游戏、轻小说相关视频和游戏资源</description>
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
