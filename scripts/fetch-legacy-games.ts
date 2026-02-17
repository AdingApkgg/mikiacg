#!/usr/bin/env npx tsx
/**
 * 旧站游戏数据抓取 & 迁移脚本
 * 从 www.mikiacg.org 的分类页面抓取所有游戏文章，提取结构化数据
 *
 * 数据来源：
 *   - /sitemap.xml 获取全部文章链接，自动过滤出游戏文章
 *
 * 旧站结构（Joe 主题）：
 *   - 每个 archives/{id}.html 对应 1 款游戏
 *   - 标题格式：【类型/免费】游戏名 VerX.X
 *   - 内容区含短代码 tabs-pane：游戏截图、游戏介绍、角色介绍、游戏信息
 *   - 下载链接：<joe-cloud> 元素
 *   - 封面：Joe.CONTENT.cover
 *   - 关键词/描述：Joe.CONTENT.fields
 *
 * 运行方式: npx tsx scripts/fetch-legacy-games.ts
 * 可选参数:
 *   --concurrency=N    并发数（默认 5）
 *   --timeout=N        请求超时秒数（默认 20）
 *   --single=URL       只抓取单个页面（调试用）
 *   --dry-run          只抓取导出 JSON，不写入数据库
 *   --export           导出为 JSON 文件（可在上传页批量导入）
 */

import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

// ─── 配置 ────────────────────────────────────────────────

const BASE_URL = "https://www.mikiacg.org";
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    concurrency: 5,
    timeout: 20_000,
    single: "",
    dryRun: false,
    export: false,
  };
  for (const arg of args) {
    if (arg === "--dry-run") { config.dryRun = true; continue; }
    if (arg === "--export") { config.export = true; continue; }
    const [key, val] = arg.split("=");
    if (key === "--concurrency") config.concurrency = Number(val);
    else if (key === "--timeout") config.timeout = Number(val) * 1000;
    else if (key === "--single") config.single = val;
  }
  return config;
}

// ─── 类型 ────────────────────────────────────────────────

interface GameDownload {
  name: string;
  url: string;
  password?: string;
}

interface GameInfo {
  legacyId: string;
  title: string;
  cleanTitle: string;
  gameType: string;
  isFree: boolean;
  version: string;
  description: string;
  coverUrl: string;
  tags: string[];
  keywords: string[];
  screenshots: string[];
  videos: string[];
  characterIntro: string;
  gameInfoText: string;
  originalName: string;
  originalAuthor: string;
  authorUrl: string;
  fileSize: string;
  platforms: string[];
  downloads: GameDownload[];
  views: number;
  likes: number;
  pageUrl: string;
  error?: string;
}

// ─── 并发控制 ────────────────────────────────────────────

async function poolAll<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onDone?: (result: T, index: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let done = 0;

  async function run() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
      done++;
      onDone?.(results[i], done, tasks.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => run()),
  );
  return results;
}

// ─── 工具函数 ────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  timeout: number,
  retries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * attempt);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === retries - 1) throw e;
    }
  }
  throw new Error("unreachable");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 解码 goto 跳转链接中的 base64 URL */
function decodeGotoUrl(raw: string): string {
  const m = raw.match(/goto\?url=([A-Za-z0-9+/=]+)/);
  if (m) {
    try {
      return Buffer.from(m[1], "base64").toString("utf-8");
    } catch { /* ignore */ }
  }
  return raw;
}

// ─── 从标题解析游戏类型、名称、版本 ──────────────────────

/**
 * 解析标题格式：【类型/免费】游戏名 VerX.X
 * 例如：【SLG/免费】快感少女
 *       【ADV/免费】义妹私教辅导~哥哥我是家庭教师
 *       【SLG/免费】叛道武士 Ver2.0
 *       【RPG/免费】夜幕之花 Ver0.596
 */
function parseTitle(title: string): {
  gameType: string;
  isFree: boolean;
  cleanTitle: string;
  version: string;
} {
  let gameType = "";
  let isFree = true;
  let cleanTitle = title;
  let version = "";

  // 提取【类型/免费】前缀
  const prefixMatch = title.match(/^【([A-Za-z]+)\/([^】]+)】\s*/);
  if (prefixMatch) {
    gameType = prefixMatch[1].toUpperCase();
    isFree = prefixMatch[2].includes("免费");
    cleanTitle = title.slice(prefixMatch[0].length).trim();
  } else {
    // 尝试其他格式：【类型】游戏名
    const altMatch = title.match(/^【([A-Za-z]+)】\s*/);
    if (altMatch) {
      gameType = altMatch[1].toUpperCase();
      cleanTitle = title.slice(altMatch[0].length).trim();
    }
  }

  // 提取版本号
  const versionMatch = cleanTitle.match(/\s+(Ver\.?\s*[\d.]+[a-zA-Z]?\s*)$/i);
  if (versionMatch) {
    version = versionMatch[1].trim();
    cleanTitle = cleanTitle.slice(0, -versionMatch[0].length).trim();
  }

  return { gameType, isFree, cleanTitle, version };
}

// ─── 从 sitemap.xml 发现文章链接 ─────────────────────────

async function discoverArticlesFromSitemap(
  timeout: number,
): Promise<string[]> {
  console.log(`  抓取 sitemap: ${SITEMAP_URL}`);
  const xml = await fetchWithRetry(SITEMAP_URL, timeout);
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  $("url > loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (loc.includes("/archives/")) {
      urls.push(loc);
    }
  });

  // 按 ID 排序
  urls.sort((a, b) => {
    const idA = parseInt(a.match(/archives\/(\d+)/)?.[1] ?? "0", 10);
    const idB = parseInt(b.match(/archives\/(\d+)/)?.[1] ?? "0", 10);
    return idA - idB;
  });

  console.log(`    发现 ${urls.length} 篇文章`);
  return urls;
}

// ─── 从游戏页面提取信息 ──────────────────────────────────

async function extractGameFromPage(
  pageUrl: string,
  timeout: number,
): Promise<GameInfo> {
  const idMatch = pageUrl.match(/\/archives\/(\d+)\.html/);
  const legacyId = idMatch?.[1] ?? "0";

  const base: GameInfo = {
    legacyId,
    title: "",
    cleanTitle: "",
    gameType: "",
    isFree: true,
    version: "",
    description: "",
    coverUrl: "",
    tags: [],
    keywords: [],
    screenshots: [],
    videos: [],
    characterIntro: "",
    gameInfoText: "",
    originalName: "",
    originalAuthor: "",
    authorUrl: "",
    fileSize: "",
    platforms: [],
    downloads: [],
    views: 0,
    likes: 0,
    pageUrl,
  };

  try {
    const html = await fetchWithRetry(pageUrl, timeout);
    const $ = cheerio.load(html);

    // ── 解析 Joe.CONTENT 脚本块 ──
    const scriptContent = $("script")
      .toArray()
      .map((el) => $(el).html() ?? "")
      .join("\n");

    // Joe.CONTENT.cover
    const joeContentCover =
      scriptContent.match(/Joe\.CONTENT\.cover\s*=\s*`([^`]*)`/)?.[1] ?? "";

    // Joe.CONTENT.fields
    let fieldsAbstract = "";
    let fieldsKeywords = "";
    const fieldsMatch = scriptContent.match(
      /Joe\.CONTENT\.fields\s*=\s*(\{[\s\S]*?\});/,
    );
    if (fieldsMatch) {
      try {
        const fields = JSON.parse(fieldsMatch[1]);
        fieldsAbstract = fields.abstract ?? fields.description ?? "";
        fieldsKeywords = fields.keywords ?? "";
      } catch { /* ignore */ }
    }

    // ── 标题 ──
    const title = (
      $("h1.joe_detail__title").text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim() ||
      ""
    ).replace(/\s*[-|]\s*咪咔Game.*$/, "");

    if (!title) return { ...base, error: "无标题" };

    // 解析标题
    const { gameType, isFree, cleanTitle, version } = parseTitle(title);

    // ── 描述 ──
    const description =
      fieldsAbstract ||
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";

    // ── 关键词 ──
    const keywords: string[] = fieldsKeywords
      ? fieldsKeywords
          .split(/[,，]/)
          .map((k: string) => k.trim())
          .filter(Boolean)
      : [];

    // ── 标签（从 article-tags 区域提取） ──
    const tags: string[] = [];
    $(".article-tags a").each((_, el) => {
      const text = $(el).text().replace(/^#\s*/, "").trim();
      if (text && !tags.includes(text)) tags.push(text);
    });

    // ── 封面 ──
    const coverUrl =
      joeContentCover ||
      $('meta[property="og:image"]').attr("content") ||
      "";

    // ── 下载链接（<joe-cloud> 元素） ──
    const downloads: GameDownload[] = [];
    $("joe-cloud").each((_, el) => {
      const $el = $(el);
      const name = $el.attr("title") ?? "下载";
      const rawUrl = $el.attr("url") ?? "";
      const password = $el.attr("password") || undefined;
      if (rawUrl) {
        downloads.push({
          name,
          url: decodeGotoUrl(rawUrl),
          password: password || undefined,
        });
      }
    });

    // ── 解析文章内容区域的 tabs-pane 短代码 ──
    const articleHtml = $("article.joe_detail__article").html() ?? "";

    // 游戏截图（包含图片和视频的混合列表）
    const allMedia: string[] = [];
    const screenshotMatch = articleHtml.match(
      /\{tabs-pane label="游戏截图"\}([\s\S]*?)\{\/tabs-pane\}/,
    );
    if (screenshotMatch) {
      // 提取图片 src
      const imgRegex = /src="([^"]+)"/g;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(screenshotMatch[1])) !== null) {
        const url = imgMatch[1];
        if (url && !url.includes("lazyload")) {
          allMedia.push(url);
        }
      }
    }
    // 也从 <img> 标签中提取截图（article 内且在截图 tab 之后）
    if (allMedia.length === 0) {
      const screenshotImgMatch = articleHtml.match(
        /label="游戏截图"[\s\S]*?(<img[\s\S]*?)(?:\{\/tabs-pane\}|\{tabs-pane)/,
      );
      if (screenshotImgMatch) {
        const imgRe = /(?:src|data-src)="(https?:\/\/[^"]+)"/g;
        let m: RegExpExecArray | null;
        while ((m = imgRe.exec(screenshotImgMatch[1])) !== null) {
          if (!m[1].includes("lazyload")) {
            allMedia.push(m[1]);
          }
        }
      }
    }

    // 将混合列表分离为图片和视频
    const videoExts = /\.(mp4|webm|ogg|mov|m3u8)$/i;
    const screenshots = allMedia.filter((url) => !videoExts.test(url));
    const videos = allMedia.filter((url) => videoExts.test(url));

    // 游戏介绍（tabs-pane label="游戏介绍"）
    let gameDescription = "";
    const introMatch = articleHtml.match(
      /\{tabs-pane label="游戏介绍"\}([\s\S]*?)\{\/tabs-pane\}/,
    );
    if (introMatch) {
      gameDescription = introMatch[1]
        .replace(/<[^>]+>/g, "\n")
        .replace(/\{[^}]+\}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // 角色介绍
    let characterIntro = "";
    const charMatch = articleHtml.match(
      /\{tabs-pane label="角色介绍"\}([\s\S]*?)\{\/tabs-pane\}/,
    );
    if (charMatch) {
      // 角色介绍可能是图片或文字
      const charImgs: string[] = [];
      const charImgRe = /src="(https?:\/\/[^"]+)"/g;
      let cm: RegExpExecArray | null;
      while ((cm = charImgRe.exec(charMatch[1])) !== null) {
        if (!cm[1].includes("lazyload")) {
          charImgs.push(cm[1]);
        }
      }
      // 如果全是图片，把图片 URL 作为角色介绍
      if (charImgs.length > 0) {
        characterIntro = charImgs.map((url) => `![角色](${url})`).join("\n");
      } else {
        characterIntro = charMatch[1]
          .replace(/<[^>]+>/g, "\n")
          .replace(/\{[^}]+\}/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
    }

    // 游戏信息
    let originalName = "";
    let originalAuthor = "";
    let authorUrl = "";
    let fileSize = "";
    const platforms: string[] = [];
    let gameInfoText = "";

    const infoMatch = articleHtml.match(
      /\{tabs-pane label="游戏信息"\}([\s\S]*?)\{\/tabs-pane\}/,
    );
    if (infoMatch) {
      const infoHtml = infoMatch[1];
      gameInfoText = infoHtml
        .replace(/<[^>]+>/g, "\n")
        .replace(/\{[^}]+\}/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      // 游戏原名
      const nameMatch = infoHtml.match(/游戏原名[：:]\s*(?:<[^>]*>)*\s*【([^】]+)】/);
      if (nameMatch) originalName = nameMatch[1].trim();

      // 原作者
      const authorMatches = infoHtml.match(/原作者[：:]\s*(?:<[^>]*>)*\s*([\s\S]*?)(?=<strong>|<joe-|$)/);
      if (authorMatches) {
        const authorNames: string[] = [];
        const bracketRe = /【([^】]+)】/g;
        let am: RegExpExecArray | null;
        while ((am = bracketRe.exec(authorMatches[1])) !== null) {
          authorNames.push(am[1].trim());
        }
        originalAuthor = authorNames.join(" / ");
      }

      // 作者网址
      const urlMatch = infoHtml.match(/作者网址[\s\S]*?href="([^"]+)"/);
      if (urlMatch) authorUrl = urlMatch[1];

      // 文件大小
      const sizeMatch = infoHtml.match(/(?:解压.*?大小|文件.*?大小|游戏大小)[：:]\s*(?:<[^>]*>)*\s*([^<\n{]+)/);
      if (sizeMatch) fileSize = sizeMatch[1].replace(/\s+/g, " ").trim();

      // 平台
      if (fileSize.includes("电脑") || fileSize.includes("PC")) platforms.push("PC");
      if (fileSize.includes("安卓") || fileSize.includes("Android")) platforms.push("Android");
    }

    // ── 浏览量 ──
    let views = 0;
    const viewsText = $(".joe_detail__count-views .num").text().trim() ||
      $(".post-meta .views").text().trim();
    if (viewsText) {
      views = parseInt(viewsText.replace(/[,，]/g, ""), 10) || 0;
    }

    // ── 点赞数 ──
    let likes = 0;
    const likesText = $(".action-like count").text().trim();
    if (likesText) {
      likes = parseInt(likesText.replace(/[,，]/g, ""), 10) || 0;
    }

    // 使用 tabs 内的描述覆盖 meta 描述（更丰富）
    const finalDescription = gameDescription || description;

    return {
      legacyId,
      title,
      cleanTitle,
      gameType,
      isFree,
      version,
      description: finalDescription,
      coverUrl,
      tags,
      keywords,
      screenshots,
      videos,
      characterIntro,
      gameInfoText,
      originalName,
      originalAuthor,
      authorUrl,
      fileSize,
      platforms,
      downloads,
      views,
      likes,
      pageUrl,
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── 写入数据库 ──────────────────────────────────────────

async function writeToDatabase(games: GameInfo[]) {
  // 动态加载 Prisma（避免脚本不需要 DB 时也要连接）
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    console.log("\n开始写入数据库...");
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const game of games) {
      if (game.error || !game.title) {
        skipped++;
        continue;
      }

      try {
        // 生成 6 位数字 ID
        let gameId = "";
        for (let i = 0; i < 100; i++) {
          const randomNum = Math.floor(Math.random() * 1000000);
          const id = randomNum.toString().padStart(6, "0");
          const existing = await prisma.game.findUnique({
            where: { id },
            select: { id: true },
          });
          if (!existing) {
            gameId = id;
            break;
          }
        }
        if (!gameId) {
          console.log(`  ✗ ${game.title} - 无法生成唯一 ID`);
          failed++;
          continue;
        }

        // 查找或创建管理员用户（第一个 OWNER）
        const owner = await prisma.user.findFirst({
          where: { role: "OWNER" },
          select: { id: true },
        });
        if (!owner) {
          console.log("  ✗ 未找到站长用户，请先创建站长账号");
          break;
        }

        // 处理标签
        const tagConnections: { tagId: string }[] = [];
        const allTags = [...game.tags];
        // 添加游戏类型作为标签
        if (game.gameType && !allTags.includes(game.gameType)) {
          allTags.push(game.gameType);
        }

        for (const tagName of allTags) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
          if (!slug) continue;
          const tag = await prisma.tag.upsert({
            where: { slug },
            update: {},
            create: { name: tagName, slug },
          });
          tagConnections.push({ tagId: tag.id });
        }

        // 构建 extraInfo
        const extraInfo: Record<string, unknown> = {};
        if (game.originalName) extraInfo.originalName = game.originalName;
        if (game.originalAuthor) extraInfo.originalAuthor = game.originalAuthor;
        if (game.authorUrl) extraInfo.authorUrl = game.authorUrl;
        if (game.fileSize) extraInfo.fileSize = game.fileSize;
        if (game.platforms.length > 0) extraInfo.platforms = game.platforms;
        if (game.screenshots.length > 0) extraInfo.screenshots = game.screenshots;
        if (game.videos.length > 0) extraInfo.videos = game.videos;
        if (game.characterIntro) extraInfo.characterIntro = game.characterIntro;
        if (game.downloads.length > 0) extraInfo.downloads = game.downloads;
        if (game.keywords.length > 0) extraInfo.keywords = game.keywords;

        await prisma.game.create({
          data: {
            id: gameId,
            title: game.title,
            description: game.description || null,
            coverUrl: game.coverUrl || null,
            gameType: game.gameType || null,
            isFree: game.isFree,
            version: game.version || null,
            views: game.views,
            status: "PUBLISHED",
            extraInfo: Object.keys(extraInfo).length > 0 ? extraInfo : undefined,
            uploaderId: owner.id,
            tags: {
              create: tagConnections,
            },
          },
        });

        created++;
        console.log(`  ✓ [${gameId}] ${game.title}`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${game.title} - ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(`\n写入完成: 成功 ${created}, 跳过 ${skipped}, 失败 ${failed}`);
    await prisma.$disconnect();
  } catch (e) {
    console.error("数据库错误:", e);
    await prisma.$disconnect();
    throw e;
  }
}

// ─── 导出为 JSON（可直接在上传页批量导入） ──────────────

function exportToJson(games: GameInfo[]): string {
  const valid = games.filter((g) => g.title && !g.error);
  const timestamp = new Date()
    .toISOString()
    .replace(/[T:]/g, "_")
    .slice(0, 19);
  const outputFile = `legacy_games_${timestamp}.json`;

  const output = valid.map((game) => {
    const extraInfo: Record<string, unknown> = {};
    if (game.originalName) extraInfo.originalName = game.originalName;
    if (game.originalAuthor) extraInfo.originalAuthor = game.originalAuthor;
    if (game.authorUrl) extraInfo.originalAuthorUrl = game.authorUrl;
    if (game.fileSize) extraInfo.fileSize = game.fileSize;
    if (game.platforms.length > 0) extraInfo.platforms = game.platforms;
    if (game.screenshots.length > 0) extraInfo.screenshots = game.screenshots;
    if (game.videos.length > 0) extraInfo.videos = game.videos;
    if (game.downloads.length > 0) extraInfo.downloads = game.downloads;
    if (game.keywords.length > 0) extraInfo.keywords = game.keywords;

    const allTags = [...new Set([...game.tags, ...game.keywords])].filter(Boolean);

    return {
      title: game.title,
      description: game.description || undefined,
      coverUrl: game.coverUrl || undefined,
      gameType: game.gameType || undefined,
      isFree: game.isFree,
      version: game.version || undefined,
      tagNames: allTags.length > 0 ? allTags : undefined,
      extraInfo: Object.keys(extraInfo).length > 0 ? extraInfo : undefined,
    };
  });

  writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  return outputFile;
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const startTime = performance.now();

  // 单页调试模式
  if (config.single) {
    console.log(`单页调试: ${config.single}`);
    const info = await extractGameFromPage(config.single, config.timeout);
    console.log("─".repeat(50));
    console.log(`标题: ${info.title}`);
    console.log(`清洁标题: ${info.cleanTitle}`);
    console.log(`类型: ${info.gameType || "（未知）"}`);
    console.log(`免费: ${info.isFree ? "是" : "否"}`);
    console.log(`版本: ${info.version || "（无）"}`);
    console.log(`描述: ${info.description.slice(0, 100)}${info.description.length > 100 ? "..." : ""}`);
    console.log(`封面: ${info.coverUrl}`);
    console.log(`标签: ${info.tags.join(", ") || "（无）"}`);
    console.log(`关键词: ${info.keywords.join(", ") || "（无）"}`);
    console.log(`截图数: ${info.screenshots.length}`);
    if (info.screenshots.length > 0) {
      info.screenshots.slice(0, 3).forEach((url, i) => console.log(`  截图${i + 1}: ${url}`));
    }
    console.log(`视频数: ${info.videos.length}`);
    if (info.videos.length > 0) {
      info.videos.forEach((url, i) => console.log(`  视频${i + 1}: ${url}`));
    }
    console.log(`角色介绍: ${info.characterIntro ? info.characterIntro.slice(0, 80) + "..." : "（无）"}`);
    console.log(`游戏原名: ${info.originalName || "（无）"}`);
    console.log(`原作者: ${info.originalAuthor || "（无）"}`);
    console.log(`作者网址: ${info.authorUrl || "（无）"}`);
    console.log(`文件大小: ${info.fileSize || "（无）"}`);
    console.log(`平台: ${info.platforms.join(", ") || "（无）"}`);
    console.log(`下载链接: ${info.downloads.length}`);
    info.downloads.forEach((d) => {
      console.log(`  ${d.name}: ${d.url}${d.password ? ` (密码: ${d.password})` : ""}`);
    });
    console.log(`浏览量: ${info.views}`);
    console.log(`点赞数: ${info.likes}`);
    if (info.error) console.log(`错误: ${info.error}`);
    return;
  }

  const skipDb = config.dryRun || config.export;
  console.log(`从 sitemap.xml 发现文章，并发数: ${config.concurrency}`);
  if (skipDb) console.log("模式: 仅导出（不写入数据库）");
  console.log("─".repeat(50));

  // 1) 从 sitemap 获取所有文章链接
  console.log("发现文章...");
  const allLinks = await discoverArticlesFromSitemap(config.timeout);

  console.log(`\n共发现 ${allLinks.length} 篇文章，开始抓取详情...`);
  console.log("─".repeat(50));

  // 2) 并发抓取详情页
  const tasks = allLinks.map(
    (link) => () => extractGameFromPage(link, config.timeout),
  );

  const allPages = await poolAll(tasks, config.concurrency, (result, done, total) => {
    const status = result.error
      ? `✗ ${result.error}`
      : result.gameType
        ? `✓ [${result.gameType}]`
        : "- 非游戏，跳过";
    const name = result.title ? result.title.slice(0, 40) : "未知";
    console.log(`[${done}/${total}] ${name} ${status}`);
  });

  // 只保留有游戏类型前缀（【类型/免费】）的文章
  const games = allPages.filter((g) => g.gameType);

  console.log("─".repeat(50));

  // 3) 统计
  const validGames = games.filter((g) => g.title && !g.error);
  const errorCount = games.filter((g) => g.error).length;
  const nonGameCount = allPages.length - games.length;
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  console.log(`抓取完成 (${elapsed}s):`);
  console.log(`  总文章数: ${allPages.length}`);
  console.log(`  非游戏（跳过）: ${nonGameCount}`);
  console.log(`  有效游戏: ${validGames.length}`);
  console.log(`  抓取失败: ${errorCount}`);

  // 类型统计
  const typeStats = new Map<string, number>();
  for (const g of validGames) {
    const t = g.gameType || "未知";
    typeStats.set(t, (typeStats.get(t) || 0) + 1);
  }
  console.log("  类型分布:");
  for (const [type, count] of [...typeStats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // 4) 导出 JSON
  if (config.export || config.dryRun) {
    const outputFile = exportToJson(games);
    console.log(`\n已导出 JSON: ${outputFile}（共 ${validGames.length} 个游戏）`);
  }

  // 5) 写入数据库
  if (!skipDb) {
    await writeToDatabase(validGames);
  }
}

main().catch((e) => {
  console.error("致命错误:", e);
  process.exit(1);
});
