#!/usr/bin/env npx tsx
/**
 * 旧站视频抓取脚本
 * 按 archives ID 顺序扫描 tv.mikiacg.org 上的所有文章，提取视频数据并导出为批量导入格式
 *
 * 数据结构对应关系：
 *   - 每个 archives/{id}.html 对应 1 篇文章（可能有内容或为空页）
 *   - 1 篇文章 = 1 个作者合集，合集中可含多集（episodes）
 *   - 不依赖分类页（分类页可能未列出所有文章），改为按 ID 递增扫描
 *   - 连续遇到 N 个空页后自动停止扫描
 *
 * 运行方式: npx tsx scripts/fetch-legacy-site.ts
 * 可选参数:
 *   --start-id=N       起始 archives ID（默认 1）
 *   --max-id=N         最大 archives ID（默认 200）
 *   --max-empty=N      连续空页停止阈值（默认 20）
 *   --concurrency=N    并发数（默认 8）
 *   --timeout=N        请求超时秒数（默认 20）
 *   --single=URL       只抓取单个页面（调试用）
 */

import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

// ─── 配置 ────────────────────────────────────────────────

const BASE_URL = "https://tv.mikiacg.org";
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

// 从命令行参数解析配置
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    startId: 1,
    maxId: 200,
    maxEmpty: 20,
    concurrency: 8,
    timeout: 20_000,
    single: "",
  };
  for (const arg of args) {
    const [key, val] = arg.split("=");
    if (key === "--start-id") config.startId = Number(val);
    else if (key === "--max-id") config.maxId = Number(val);
    else if (key === "--max-empty") config.maxEmpty = Number(val);
    else if (key === "--concurrency") config.concurrency = Number(val);
    else if (key === "--timeout") config.timeout = Number(val) * 1000;
    else if (key === "--single") config.single = val;
  }
  return config;
}

// ─── 类型 ────────────────────────────────────────────────

interface Episode {
  num: number;
  title: string;
  videoUrl: string;
  coverUrl: string;
}

interface Download {
  name: string;
  url: string;
  password?: string;
}

interface VideoInfo {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  tags: string[];
  keywords: string[];
  episodes: Episode[];
  downloads: Download[];
  authorIntro: string;
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

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => run()));
  return results;
}

// ─── 带重试的 fetch ──────────────────────────────────────

async function fetchWithRetry(
  url: string,
  timeout: number,
  retries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) await sleep(500 * attempt);
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

// ─── 从标题提取作者 ──────────────────────────────────────

function extractAuthor(title: string): string {
  const patterns = [
    /【[^】]+】\s*([^「（【\n]+?)\s*[「（]/,
    /【[^】]+】\s*([^-–\n]+?)\s*[-–]\s*第?\d/,
    /【[^】]+】\s*([A-Za-z0-9_\-\s]+?)(?:\s*$|\s*[-–])/,
    /【[^】]+】\s*([^\s「【\-（]+)/,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) {
      const author = m[1].trim();
      if (author.length >= 2 && author.length <= 50) return author;
    }
  }
  return "未分类";
}

// ─── 按 ID 扫描发现有效文章 ──────────────────────────────

/** 逐个检测 archives ID 是否有内容（有标题即为有效），返回有效文章的 URL 列表 */
async function discoverArticlesByIdScan(
  startId: number,
  maxId: number,
  maxEmpty: number,
  concurrency: number,
  timeout: number,
): Promise<string[]> {
  const validUrls: string[] = [];
  let consecutiveEmpty = 0;

  for (let id = startId; id <= maxId; id++) {
    const url = `${BASE_URL}/index.php/archives/${id}.html`;
    try {
      const html = await fetchWithRetry(url, timeout);
      const $ = cheerio.load(html);
      const title =
        $("h1.joe_detail__title").text().trim() ||
        $('meta[property="og:title"]').attr("content")?.trim() ||
        "";
      const hasTitle = title.length > 0 && !title.includes("咪咔映阁");

      if (hasTitle) {
        validUrls.push(url);
        consecutiveEmpty = 0;
        process.stdout.write(`  [${id}] ✓ ${title.slice(0, 30)}\n`);
      } else {
        consecutiveEmpty++;
        if (consecutiveEmpty >= maxEmpty) {
          console.log(`  连续 ${maxEmpty} 个空页，停止扫描（最后 ID: ${id}）`);
          break;
        }
      }
    } catch {
      consecutiveEmpty++;
      if (consecutiveEmpty >= maxEmpty) {
        console.log(`  连续 ${maxEmpty} 个无效页，停止扫描（最后 ID: ${id}）`);
        break;
      }
    }
  }

  return validUrls;
}

// ─── 解码 goto 跳转链接中的 base64 URL ──────────────────

function decodeGotoUrl(raw: string): string {
  const m = raw.match(/goto\?url=([A-Za-z0-9+/=]+)/);
  if (m) {
    try {
      return Buffer.from(m[1], "base64").toString("utf-8");
    } catch {
      /* ignore */
    }
  }
  return raw;
}

// ─── 从视频页面提取信息 ──────────────────────────────────

async function extractFromPage(
  pageUrl: string,
  timeout: number,
): Promise<VideoInfo> {
  const idMatch = pageUrl.match(/\/archives\/(\d+)\.html/);
  const videoId = idMatch?.[1] ?? String(pageUrl.length);

  const base: VideoInfo = {
    id: videoId,
    title: "",
    author: "",
    description: "",
    coverUrl: "",
    videoUrl: "",
    tags: [],
    keywords: [],
    episodes: [],
    downloads: [],
    authorIntro: "",
    pageUrl,
  };

  try {
    const html = await fetchWithRetry(pageUrl, timeout);
    const $ = cheerio.load(html);

    // ── 先解析 Joe.CONTENT 脚本块（结构化数据源） ──
    const scriptContent = $("script")
      .toArray()
      .map((el) => $(el).html() ?? "")
      .join("\n");

    // Joe.CONTENT.cover — 最可靠的封面来源
    const joeContentCover =
      scriptContent.match(/Joe\.CONTENT\.cover\s*=\s*`([^`]*)`/)?.[1] ?? "";

    // Joe.CONTENT.fields — JSON 结构化字段
    let fieldsAbstract = "";
    let fieldsKeywords = "";
    let fieldsVideo = "";
    const fieldsMatch = scriptContent.match(
      /Joe\.CONTENT\.fields\s*=\s*(\{[\s\S]*?\});/,
    );
    if (fieldsMatch) {
      try {
        const fields = JSON.parse(fieldsMatch[1]);
        fieldsAbstract = fields.abstract ?? fields.description ?? "";
        fieldsKeywords = fields.keywords ?? "";
        fieldsVideo = fields.video ?? "";
      } catch {
        /* JSON 解析失败，忽略 */
      }
    }

    // ── 标题 ──
    const title = (
      $("h1.joe_detail__title").text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim() ||
      ""
    ).replace(/\s*[-|]\s*咪咔映阁.*$/, "");

    if (!title) return { ...base, error: "无标题" };

    // ── 描述（优先 fields.abstract，比 meta description 更干净） ──
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

    // ── 标签 ──
    const tags: string[] = [];
    $(".article-tags a").each((_, el) => {
      const text = $(el).text().replace(/^#\s*/, "").trim();
      if (text && !tags.includes(text)) tags.push(text);
    });

    // ── 封面（优先 Joe.CONTENT.cover，再 og:image） ──
    const coverUrl =
      joeContentCover ||
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $(".joe_detail__thumb").attr("src") ||
      "";

    // ── 下载链接（从 <joe-cloud> 元素） ──
    const downloads: Download[] = [];
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

    // ── 作者介绍（从页面文章体内提取） ──
    let authorIntro = "";
    // Joe 主题的 tabs-pane 会渲染成 HTML，查找含"作者介绍"标签的内容区
    const articleHtml = $("article.joe_detail__article").html() ?? "";
    const authorIntroMatch = articleHtml.match(
      /label="作者介绍"\}([\s\S]*?)\{\/tabs-pane\}/,
    );
    if (authorIntroMatch) {
      // 清理 HTML/短代码，保留纯文本
      authorIntro = authorIntroMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\{[^}]+\}/g, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    // ── 剧集（核心：多层兜底） ──
    const episodes: Episode[] = [];

    // 方式 1：从剧集列表 <a class="switch-video" video-url="..." data-index="N" data-title="...">
    $("a.switch-video[video-url]").each((_, el) => {
      const $el = $(el);
      const url = $el.attr("video-url") ?? "";
      if (!url) return;

      // 优先用 data-index 取集号，兜底从文本解析「第N集」
      const dataIndex = $el.attr("data-index");
      let num = dataIndex ? Number(dataIndex) : 0;
      if (!num) {
        const epText = $el.text().trim();
        const numMatch = epText.match(/第(\d+)集/);
        if (!numMatch) return;
        num = Number(numMatch[1]);
      }

      // 优先用 data-title 取剧集标题，兜底 data-original-title / .video-desc-box 文本
      const subTitle =
        $el.attr("data-title")?.trim() ||
        $el.attr("data-original-title")?.trim() ||
        $el.find(".video-desc-box").first().contents().filter(function () {
          return this.type === "text";
        }).text().trim() ||
        "";

      // 封面：优先 data-cover 属性，兜底 .video-thumbnail-right 内的 img
      const epCover =
        $el.attr("data-cover")?.trim() ||
        $el.find(".video-thumbnail-right img").attr("src")?.trim() ||
        "";

      if (num > 0 && !episodes.some((e) => e.num === num)) {
        episodes.push({
          num,
          title: subTitle || `第${num}集`,
          videoUrl: url,
          coverUrl: epCover,
        });
      }
    });

    // 方式 2：从 Joe.CONTENT.fields.video（Markdown 链接 [第N集--标题](url)）
    if (episodes.length === 0 && fieldsVideo) {
      // 匹配 [第N集--副标题](url) 或 [短片--副标题](url)
      const mdRe =
        /\[(?:第(\d+)集|([^\]]+?))(?:--([^\]]*))?\]\((https?:\/\/[^)]+)\)/g;
      let m: RegExpExecArray | null;
      let autoNum = 0;
      while ((m = mdRe.exec(fieldsVideo)) !== null) {
        autoNum++;
        const num = m[1] ? Number(m[1]) : autoNum;
        const prefix = m[2] ?? "";
        const subtitle = m[3]?.trim() ?? "";
        const url = m[4];

        const epTitle = subtitle
          ? prefix
            ? `${prefix} - ${subtitle}`
            : subtitle
          : prefix || `第${num}集`;

        if (!episodes.some((e) => e.num === num)) {
          episodes.push({ num, title: epTitle, videoUrl: url, coverUrl: "" });
        }
      }
    }

    // 方式 3：兜底 — DPlayer 初始化 URL 或页面内唯一视频
    if (episodes.length === 0) {
      const dplayerVideo = $(".dplayer-video source").attr("src") ?? "";
      if (dplayerVideo) {
        episodes.push({ num: 1, title: "正片", videoUrl: dplayerVideo, coverUrl: "" });
      }
    }

    episodes.sort((a, b) => a.num - b.num);

    return {
      id: videoId,
      title,
      author: extractAuthor(title),
      description,
      coverUrl,
      videoUrl: episodes[0]?.videoUrl ?? "",
      tags,
      keywords,
      episodes,
      downloads,
      authorIntro,
      pageUrl,
    };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── 生成批量导入文本 ────────────────────────────────────

interface ExportVideo {
  title: string;
  description?: string;
  coverUrl?: string;
  videoUrl: string;
  tagNames?: string[];
  extraInfo?: Record<string, unknown>;
}

interface ExportSeries {
  seriesTitle: string;
  description?: string;
  coverUrl?: string;
  videos: ExportVideo[];
}

function generateImportJson(videos: VideoInfo[]): {
  data: { series: ExportSeries[] };
  videoCount: number;
} {
  const valid = videos.filter(
    (v) => v.title && !v.error && (v.videoUrl || v.episodes.length > 0),
  );

  // 按作者分组
  const grouped = new Map<string, VideoInfo[]>();
  for (const v of valid) {
    const author = v.author || "未分类";
    if (!grouped.has(author)) grouped.set(author, []);
    grouped.get(author)!.push(v);
  }

  const seriesList: ExportSeries[] = [];
  let videoCount = 0;

  for (const [author, vids] of [...grouped.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const ref = vids[0];

    // 合并 tags + keywords 去重
    const allTags = [...ref.tags];
    for (const kw of ref.keywords) {
      if (!allTags.includes(kw)) allTags.push(kw);
    }

    const seriesDesc = ref.authorIntro || ref.description || undefined;

    const seriesVideos: ExportVideo[] = [];

    for (const v of vids) {
      const buildExtraInfo = (vi: VideoInfo): Record<string, unknown> | undefined => {
        const info: Record<string, unknown> = {};
        if (vi.authorIntro) info.authorIntro = vi.authorIntro;
        if (vi.author && vi.author !== author) info.author = vi.author;
        if (vi.keywords.length > 0) info.keywords = vi.keywords;
        if (vi.downloads.length > 0) info.downloads = vi.downloads;
        return Object.keys(info).length > 0 ? info : undefined;
      };

      const addEpisode = (ep: Episode) => {
        seriesVideos.push({
          title: `${v.title} - ${ep.title}`,
          coverUrl: ep.coverUrl || undefined,
          videoUrl: ep.videoUrl,
          tagNames: allTags.length > 0 ? allTags : undefined,
          extraInfo: buildExtraInfo(v),
        });
        videoCount++;
      };

      if (v.episodes.length > 1) {
        for (const ep of v.episodes.filter((e) => e.videoUrl)) {
          addEpisode(ep);
        }
      } else if (v.episodes.length === 1) {
        addEpisode(v.episodes[0]);
      } else if (v.videoUrl) {
        seriesVideos.push({
          title: v.title,
          description: v.description || undefined,
          coverUrl: v.coverUrl || undefined,
          videoUrl: v.videoUrl,
          tagNames: allTags.length > 0 ? allTags : undefined,
          extraInfo: buildExtraInfo(v),
        });
        videoCount++;
      }
    }

    if (seriesVideos.length > 0) {
      seriesList.push({
        seriesTitle: author,
        description: seriesDesc,
        coverUrl: ref.coverUrl || undefined,
        videos: seriesVideos,
      });
    }
  }

  return { data: { series: seriesList }, videoCount };
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const startTime = performance.now();

  // 单页调试模式
  if (config.single) {
    console.log(`单页调试: ${config.single}`);
    const info = await extractFromPage(config.single, config.timeout);
    console.log(`标题: ${info.title}`);
    console.log(`作者: ${info.author}`);
    console.log(`描述: ${info.description.slice(0, 80)}${info.description.length > 80 ? "..." : ""}`);
    console.log(`封面: ${info.coverUrl}`);
    console.log(`标签: ${info.tags.join(", ") || "（无）"}`);
    console.log(`关键词: ${info.keywords.join(", ") || "（无）"}`);
    console.log(`下载: ${info.downloads.length ? info.downloads.map((d) => `${d.name}: ${d.url}`).join("; ") : "（无）"}`);
    console.log(`作者介绍: ${info.authorIntro ? info.authorIntro.slice(0, 80) + "..." : "（无）"}`);
    console.log(`剧集数: ${info.episodes.length}`);
    if (info.episodes.length > 0) {
      const printEp = (ep: Episode) => {
        console.log(`  ${ep.num}. ${ep.title} → ${ep.videoUrl.slice(-50)}`);
        if (ep.coverUrl) console.log(`     封面: ${ep.coverUrl.slice(-60)}`);
      };
      console.log("前 3 集:");
      for (const ep of info.episodes.slice(0, 3)) printEp(ep);
      if (info.episodes.length > 3) {
        console.log("后 2 集:");
        for (const ep of info.episodes.slice(-2)) printEp(ep);
      }
    }
    if (info.error) console.log(`错误: ${info.error}`);
    return;
  }

  console.log(`开始扫描 ${BASE_URL}/index.php/archives/{id}.html`);
  console.log(
    `ID 范围: ${config.startId}-${config.maxId}, 连续空页阈值: ${config.maxEmpty}, 并发数: ${config.concurrency}`,
  );
  console.log("─".repeat(50));

  // 1) 按 ID 顺序扫描发现有效文章
  console.log("发现文章...");
  const uniqueLinks = await discoverArticlesByIdScan(
    config.startId,
    config.maxId,
    config.maxEmpty,
    config.concurrency,
    config.timeout,
  );

  console.log(`\n共发现 ${uniqueLinks.length} 篇有效文章（每篇 = 1 个作者合集，可含多集）`);
  console.log("─".repeat(50));

  // 2) 并发抓取详情页
  const tasks = uniqueLinks.map(
    (link) => () => extractFromPage(link, config.timeout),
  );

  const videos = await poolAll(tasks, config.concurrency, (result, done, total) => {
    const status = result.error
      ? `✗ ${result.error}`
      : result.videoUrl || result.episodes.length > 0
        ? "✓"
        : "✗ 无视频";
    const name = result.title ? result.title.slice(0, 30) : "未知";
    console.log(`[${done}/${total}] ${name} ${status}`);
  });

  console.log("─".repeat(50));

  // 3) 统计
  const validCount = videos.filter((v) => v.title && !v.error).length;
  const noVideoCount = videos.filter(
    (v) => v.title && !v.error && !v.videoUrl && v.episodes.length === 0,
  ).length;
  const errorCount = videos.filter((v) => v.error).length;
  const totalEpisodes = videos
    .filter((v) => v.title && !v.error)
    .reduce(
      (sum, v) =>
        sum +
        (v.episodes.length > 1
          ? v.episodes.filter((e) => e.videoUrl).length
          : v.videoUrl
            ? 1
            : 0),
      0,
    );

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  console.log(`抓取完成 (${elapsed}s):`);
  console.log(`  文章数: ${validCount}（每篇 1 个作者合集）`);
  console.log(`  总集数: ${totalEpisodes}`);
  console.log(`  无视频: ${noVideoCount}`);
  console.log(`  失败数: ${errorCount}`);

  // 4) 生成导入 JSON 并保存
  const { data: importData, videoCount } = generateImportJson(videos);
  const timestamp = new Date()
    .toISOString()
    .replace(/[T:]/g, "_")
    .slice(0, 19);
  const outputFile = `legacy_videos_${timestamp}.json`;

  writeFileSync(outputFile, JSON.stringify(importData, null, 2), "utf-8");
  console.log(`\n已保存到: ${outputFile}`);
  console.log(`导出合集数: ${importData.series.length}`);
  console.log(`导出视频数: ${videoCount}`);
}

main().catch((e) => {
  console.error("致命错误:", e);
  process.exit(1);
});
