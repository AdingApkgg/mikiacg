import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPrivileged } from "@/lib/permissions";
import { submitContentsToIndexNow, submitSitePages, submitToIndexNow, type IndexableContentType } from "@/lib/indexnow";
import { submitSitemapToGoogle, isGoogleConfigured } from "@/lib/google-indexing";
import { getServerConfig } from "@/lib/server-config";

const CONTENT_LABELS: Record<IndexableContentType, string> = {
  video: "视频",
  game: "游戏",
  image: "图片帖",
  series: "合集",
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "需要登录" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || !isPrivileged(user.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const body = await request.json();
    const {
      type = "recent",
      days = 7,
      urls,
    } = body as {
      type?: string;
      days?: number;
      urls?: string[];
    };

    const config = await getServerConfig();
    const hasIndexNow = !!config.indexNowKey;
    const hasGoogle = await isGoogleConfigured();

    if (!hasIndexNow && !hasGoogle) {
      return NextResponse.json({ error: "未配置任何搜索引擎推送" }, { status: 400 });
    }

    const results: {
      indexnow?: { success: number; failed: number } | boolean;
      google?: boolean;
    } = {};
    const messages: string[] = [];

    const idsByType: Partial<Record<IndexableContentType, string[]>> = {};

    switch (type) {
      case "all": {
        const [videos, games, images, seriesList] = await Promise.all([
          prisma.video.findMany({
            where: { status: "PUBLISHED" },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.game.findMany({
            where: { status: "PUBLISHED" },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.imagePost.findMany({
            where: { status: "PUBLISHED" },
            select: { id: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.series.findMany({
            select: { id: true },
            orderBy: { createdAt: "desc" },
          }),
        ]);
        idsByType.video = videos.map((v) => v.id);
        idsByType.game = games.map((g) => g.id);
        idsByType.image = images.map((i) => i.id);
        idsByType.series = seriesList.map((s) => s.id);
        break;
      }

      case "recent": {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const [videos, games, images, seriesList] = await Promise.all([
          prisma.video.findMany({
            where: {
              status: "PUBLISHED",
              OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
            },
            select: { id: true },
          }),
          prisma.game.findMany({
            where: {
              status: "PUBLISHED",
              OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
            },
            select: { id: true },
          }),
          prisma.imagePost.findMany({
            where: {
              status: "PUBLISHED",
              OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
            },
            select: { id: true },
          }),
          prisma.series.findMany({
            where: {
              OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
            },
            select: { id: true },
          }),
        ]);
        idsByType.video = videos.map((v) => v.id);
        idsByType.game = games.map((g) => g.id);
        idsByType.image = images.map((i) => i.id);
        idsByType.series = seriesList.map((s) => s.id);
        break;
      }

      case "site": {
        if (hasIndexNow) {
          results.indexnow = await submitSitePages();
          messages.push(results.indexnow ? "IndexNow: 已提交站点页面" : "IndexNow: 提交失败");
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      case "sitemap": {
        if (hasGoogle) {
          results.google = await submitSitemapToGoogle();
          messages.push(results.google ? "Google: Sitemap 已提交" : "Google: 提交失败");
        } else {
          return NextResponse.json({ error: "Google Search Console 未配置" }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      case "urls": {
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          return NextResponse.json({ error: "请提供 urls 数组" }, { status: 400 });
        }
        if (hasIndexNow) {
          results.indexnow = await submitToIndexNow(urls);
          messages.push(results.indexnow ? `IndexNow: 已提交 ${urls.length} 个 URL` : "IndexNow: 提交失败");
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      default:
        return NextResponse.json({ error: "无效的 type 参数" }, { status: 400 });
    }

    if (hasIndexNow) {
      const orderedTypes: IndexableContentType[] = ["video", "game", "image", "series"];
      const submitResults = await Promise.all(
        orderedTypes.map(async (t) => {
          const ids = idsByType[t] ?? [];
          if (ids.length === 0) return { type: t, success: 0, failed: 0 };
          const r = await submitContentsToIndexNow(t, ids);
          return { type: t, ...r };
        }),
      );

      const totalSuccess = submitResults.reduce((a, r) => a + r.success, 0);
      const totalFailed = submitResults.reduce((a, r) => a + r.failed, 0);
      results.indexnow = { success: totalSuccess, failed: totalFailed };

      const parts = submitResults.filter((r) => r.success > 0).map((r) => `${r.success} 个${CONTENT_LABELS[r.type]}`);
      messages.push(`IndexNow: ${parts.join("、") || "0 条内容"}`);
    }

    if (hasGoogle) {
      results.google = await submitSitemapToGoogle();
      messages.push(results.google ? "Google: Sitemap 已通知" : "Google: 通知失败");
    }

    return NextResponse.json({
      success: true,
      message: messages.join("; "),
      results,
    });
  } catch (error) {
    console.error("IndexNow API 错误:", error);
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }
}

export async function GET() {
  const config = await getServerConfig();
  const indexNowConfigured = !!config.indexNowKey;
  const googleConfigured = await isGoogleConfigured();

  return NextResponse.json({
    indexnow: {
      configured: indexNowConfigured,
      keyFile: indexNowConfigured ? `/${config.indexNowKey}.txt` : null,
    },
    google: {
      configured: googleConfigured,
      type: "Search Console API (Sitemap)",
      note: googleConfigured ? null : "请在后台设置中配置 Google Service Account",
    },
  });
}
