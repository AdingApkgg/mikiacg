import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.mikiacg.vip";
  const now = new Date().toISOString();

  try {
    const [videoTags, gameTags] = await Promise.all([
      prisma.tag.findMany({
        where: { videos: { some: {} } },
        select: { slug: true },
        take: 1000,
      }),
      prisma.tag.findMany({
        where: { games: { some: {} } },
        select: { slug: true },
        take: 1000,
      }),
    ]);

    const videoTagUrls = videoTags.map(
      (tag) => `  <url>
    <loc>${baseUrl}/video/tag/${tag.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`
    );

    const gameTagUrls = gameTags.map(
      (tag) => `  <url>
    <loc>${baseUrl}/game/tag/${tag.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`
    );

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...videoTagUrls, ...gameTagUrls].join("\n")}
</urlset>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Tags sitemap error:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        headers: { "Content-Type": "application/xml" },
      }
    );
  }
}
