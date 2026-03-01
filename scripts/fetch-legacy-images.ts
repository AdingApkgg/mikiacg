#!/usr/bin/env npx tsx
/**
 * 旧站图片合集抓取脚本（带浏览器登录鉴权）
 * 从 miroacg.org 抓取所有写真图集，使用 Puppeteer 完成登录（含滑块验证码），
 * 然后用获取到的 cookies 进行 fetch 批量抓取
 *
 * 运行方式: npx tsx scripts/fetch-legacy-images.ts
 * 可选参数:
 *   --username=X        登录用户名（默认取 MIROACG_USERNAME 环境变量）
 *   --password=X        登录密码（默认取 MIROACG_PASSWORD 环境变量）
 *   --concurrency=N     并发数（默认 3）
 *   --timeout=N         请求超时秒数（默认 30）
 *   --max-pages=N       最大列表页数（默认 20）
 *   --start-page=N      起始列表页（默认 1）
 *   --single=URL        只抓取单个页面（调试用）
 *   --headless          无头模式（默认有头，方便观察登录过程）
 */

import puppeteer, { type Cookie } from "puppeteer-core";
import * as cheerio from "cheerio";
import { writeFileSync } from "fs";

// ─── 配置 ────────────────────────────────────────────────

const BASE_URL = "https://www.miroacg.org";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: BASE_URL,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    username: process.env.MIROACG_USERNAME || "",
    password: process.env.MIROACG_PASSWORD || "",
    concurrency: 3,
    timeout: 30_000,
    maxPages: 20,
    startPage: 1,
    single: "",
    headless: false,
  };
  for (const arg of args) {
    if (arg === "--headless") { config.headless = true; continue; }
    const [key, ...rest] = arg.split("=");
    const val = rest.join("=");
    if (key === "--username") config.username = val;
    else if (key === "--password") config.password = val;
    else if (key === "--concurrency") config.concurrency = Number(val);
    else if (key === "--timeout") config.timeout = Number(val) * 1000;
    else if (key === "--max-pages") config.maxPages = Number(val);
    else if (key === "--start-page") config.startPage = Number(val);
    else if (key === "--single") config.single = val;
  }
  return config;
}

// ─── 类型 ────────────────────────────────────────────────

interface ImagePostInfo {
  title: string;
  description: string;
  images: string[];
  tags: string[];
  pageUrl: string;
  error?: string;
}

// ─── Cookie 管理 ─────────────────────────────────────────

let globalCookieStr = "";

function setCookiesFromPuppeteer(puppeteerCookies: Cookie[]) {
  globalCookieStr = puppeteerCookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

// ─── 带 cookie 的 fetch ──────────────────────────────────

async function fetchHtml(url: string, timeout: number, retries = 3): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) await sleep(1000 * attempt);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
        headers: { ...HEADERS, Cookie: globalCookieStr },
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

// ─── Puppeteer 登录（处理滑块验证码） ───────────────────

async function loginWithBrowser(
  username: string,
  password: string,
  headless: boolean,
): Promise<Cookie[]> {
  console.log("启动浏览器...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  // 反检测
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  try {
    // 1) 访问登录页
    console.log("  访问登录页...");
    await page.goto(`${BASE_URL}/user-sign?tab=signin`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await sleep(1000);

    // 2) 填写用户名和密码
    console.log("  填写凭据...");

    // 查找用户名输入框
    const usernameInput = await page.$('input[name="username"]');
    if (!usernameInput) {
      throw new Error("未找到用户名输入框");
    }
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(username, { delay: 50 });

    // 查找密码输入框
    const passwordInput = await page.$('input[name="password"]');
    if (!passwordInput) {
      throw new Error("未找到密码输入框");
    }
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });

    await sleep(500);

    // 3) 点击登录按钮触发验证码
    console.log("  点击登录按钮...");
    await page.evaluate(() => {
      const forms = document.querySelectorAll("form");
      for (const form of forms) {
        const actionInput = form.querySelector('input[name="action"]') as HTMLInputElement;
        if (actionInput?.value === "user_signin") {
          const btn = form.querySelector('button, input[type="submit"], .but') as HTMLElement;
          if (btn) { btn.click(); return; }
        }
      }
    });

    // 4) 等待用户手动完成拼图验证码
    console.log("");
    console.log("  ╔══════════════════════════════════════════╗");
    console.log("  ║  请在浏览器中完成拼图滑块验证码          ║");
    console.log("  ║  完成后脚本会自动继续...                 ║");
    console.log("  ╚══════════════════════════════════════════╝");
    console.log("");

    // 轮询等待登录成功（最多 120 秒）
    const maxWait = 120_000;
    const pollInterval = 2000;
    let waited = 0;
    let loginSuccess = false;

    while (waited < maxWait) {
      await sleep(pollInterval);
      waited += pollInterval;

      const currentCookies = await page.cookies();
      const hasLoggedInCookie = currentCookies.some((c) =>
        c.name.startsWith("wordpress_logged_in"),
      );

      if (hasLoggedInCookie) {
        loginSuccess = true;
        console.log("  ✓ 检测到登录成功！");
        break;
      }

      // 也检查页面 URL 变化（登录成功后通常会跳转）
      const currentUrl = page.url();
      if (!currentUrl.includes("user-sign") && !currentUrl.includes("wp-login")) {
        // 可能已经登录并跳转了
        const recheckCookies = await page.cookies();
        const hasWp = recheckCookies.some((c) => c.name.startsWith("wordpress_logged_in"));
        if (hasWp) {
          loginSuccess = true;
          console.log("  ✓ 检测到页面跳转，登录成功！");
          break;
        }
      }

      if (waited % 10000 === 0) {
        process.stdout.write(`  等待中... (${waited / 1000}s/${maxWait / 1000}s)\n`);
      }
    }

    // 5) 获取 cookies
    if (!loginSuccess) {
      console.log("  ✗ 等待超时，登录可能失败");
      await page.screenshot({ path: "login-timeout.png" });
      console.log("  已保存截图: login-timeout.png");
    }

    // 确保在正确域名下获取 cookies
    if (!page.url().startsWith(BASE_URL)) {
      await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 15000 });
      await sleep(1000);
    }

    const finalCookies = await page.cookies();
    const wpCount = finalCookies.filter(
      (c) => c.name.startsWith("wordpress_") || c.name.startsWith("wp-"),
    ).length;

    console.log(`  获取到 ${finalCookies.length} 个 cookies（WP 相关: ${wpCount}）`);

    await browser.close();
    return finalCookies;
  } catch (e) {
    console.error("  浏览器登录错误:", e);
    try {
      await page.screenshot({ path: "login-error.png" });
    } catch { /* ignore */ }
    await browser.close();
    throw e;
  }
}

// ─── 发现所有图片合集链接 ────────────────────────────────

const FORUM_URL = `${BASE_URL}/forum/489.html`;

async function discoverImagePosts(
  maxPages: number,
  startPage: number,
  timeout: number,
): Promise<string[]> {
  const postUrls: string[] = [];
  const seen = new Set<string>();

  for (let page = startPage; page <= maxPages; page++) {
    const pageUrl = page === 1
      ? FORUM_URL
      : `${FORUM_URL}/page/${page}`;

    try {
      console.log(`  抓取列表页 ${page}: ${pageUrl}`);
      const html = await fetchHtml(pageUrl, timeout);
      const $ = cheerio.load(html);

      let foundOnPage = 0;

      // 提取 forum-post 链接
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.includes("/forum-post/") && href.endsWith(".html")) {
          const fullUrl = href.startsWith("http") ? href : new URL(href, BASE_URL).href;
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            postUrls.push(fullUrl);
            foundOnPage++;
          }
        }
      });

      console.log(`    发现 ${foundOnPage} 篇文章`);

      if (foundOnPage === 0) {
        console.log(`    第 ${page} 页无新内容，停止翻页`);
        break;
      }

      await sleep(300);
    } catch (e) {
      console.log(`    第 ${page} 页失败: ${e instanceof Error ? e.message : e}`);
      if (page > startPage + 2) break;
    }
  }

  return postUrls;
}

// ─── 从详情页提取图片合集 ────────────────────────────────

async function extractImagePost(
  pageUrl: string,
  timeout: number,
): Promise<ImagePostInfo> {
  const base: ImagePostInfo = {
    title: "",
    description: "",
    images: [],
    tags: [],
    pageUrl,
  };

  try {
    const html = await fetchHtml(pageUrl, timeout);
    const $ = cheerio.load(html);

    // 检查是否仍被隐藏
    if (html.includes("该版块内容已隐藏") || html.includes("请登录后查看")) {
      return { ...base, error: "内容被隐藏（登录状态可能失效）" };
    }

    // ── 标题 ──
    const rawTitle =
      $("h1.article-title").text().trim() ||
      $("h1.entry-title").text().trim() ||
      $("h1.post-title").text().trim() ||
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("title").text().trim().replace(/\s*[-|–].+$/, "") ||
      "";

    const title = rawTitle.replace(/\s*[-|–]\s*MiRoacg.*$/, "").trim();
    if (!title) return { ...base, error: "无标题" };

    // ── 描述（从文章内容区域提取图片前的文本） ──
    let description = "";
    const $content = $(".wp-posts-content").first();
    if ($content.length > 0) {
      const textParts: string[] = [];
      $content.children().each((_, el) => {
        const $el = $(el);
        // 遇到图片则停止采集描述
        if ($el.find("img").length > 0 || $el.is("img")) return false;
        const text = $el.text().trim();
        if (text && !text.startsWith("TG") && !text.includes("t.me/")) {
          textParts.push(text);
        }
      });
      description = textParts.join("\n").trim();
    }
    if (!description) {
      description =
        $('meta[name="description"]').attr("content")?.trim() ||
        $('meta[property="og:description"]').attr("content")?.trim() ||
        "";
    }

    // ── 标签 ──
    const tags: string[] = [];
    $("a[rel='tag'], .post-tags a, .entry-tags a, .tag-list a").each((_, el) => {
      const text = $(el).text().replace(/^#\s*/, "").trim();
      if (text && !tags.includes(text)) tags.push(text);
    });

    // ── 图片提取 ──
    const images: string[] = [];
    const seenUrls = new Set<string>();

    const addImage = (url: string) => {
      if (!url || seenUrls.has(url)) return;
      if (!url.startsWith("http")) return;
      // 过滤非内容图
      const ignorePatterns = [
        "avatar", "icon", "logo", "emoji", "smilies", "gravatar",
        "wp-includes", "wp-content/themes", "thumbnail-null",
        "user-level", "vip-", ".svg",
      ];
      if (ignorePatterns.some((p) => url.includes(p))) return;
      seenUrls.add(url);
      images.push(url);
    };

    // 从文章内容区域提取
    const contentAreas = [
      ".wp-posts-content",
      ".entry-content",
      ".post-content",
      ".article-content",
      "article",
    ];

    for (const selector of contentAreas) {
      const $content = $(selector);
      if ($content.length === 0) continue;

      $content.find("img").each((_, el) => {
        const src =
          $(el).attr("data-original") ||
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src") ||
          $(el).attr("src") ||
          "";
        addImage(src);
      });

      // 也提取 <a> 指向的大图
      $content.find("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(href)) {
          addImage(href);
        }
      });

      if (images.length > 0) break;
    }

    // Gallery / 轮播组件
    $(".gallery-item img, .swiper-slide img, .wp-block-gallery img").each((_, el) => {
      const src = $(el).attr("data-original") || $(el).attr("data-src") || $(el).attr("src") || "";
      addImage(src);
    });

    // HTML 正则兜底
    if (images.length === 0) {
      const imgRegex = /(?:src|data-src|data-original)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp|avif)[^"]*)"/gi;
      let m: RegExpExecArray | null;
      while ((m = imgRegex.exec(html)) !== null) {
        addImage(m[1]);
      }
    }

    return { title, description, images, tags, pageUrl };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── 导出为新站可导入的 JSON ─────────────────────────────

function exportToJson(posts: ImagePostInfo[]): string {
  const valid = posts.filter((p) => p.title && !p.error && p.images.length > 0);
  const timestamp = new Date()
    .toISOString()
    .replace(/[T:]/g, "_")
    .slice(0, 19);
  const outputFile = `legacy_images_${timestamp}.json`;

  const output = valid.map((post) => ({
    title: post.title,
    description: post.description || undefined,
    images: post.images,
    tagNames: post.tags.length > 0 ? post.tags : undefined,
  }));

  writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf-8");
  return outputFile;
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  const config = parseArgs();
  const startTime = performance.now();

  if (!config.username || !config.password) {
    console.error("请提供登录凭据:");
    console.error("  npx tsx scripts/fetch-legacy-images.ts --username=XXX --password=XXX");
    console.error("  或设置环境变量 MIROACG_USERNAME / MIROACG_PASSWORD");
    process.exit(1);
  }

  // ── 1) 浏览器登录 ──
  console.log("═".repeat(50));
  console.log("步骤 1: 浏览器登录（处理滑块验证码）");
  console.log("═".repeat(50));

  const allCookies = await loginWithBrowser(
    config.username,
    config.password,
    config.headless,
  );

  setCookiesFromPuppeteer(allCookies);

  const hasLoggedIn = allCookies.some((c) =>
    c.name.startsWith("wordpress_logged_in"),
  );

  if (!hasLoggedIn) {
    console.log("\n⚠ 未检测到 wordpress_logged_in cookie");
    console.log("  可能需要手动完成滑块验证。请检查截图文件。");
    console.log("  如果使用 --headless 模式，请去掉该参数以便手动操作。");
    process.exit(1);
  }

  // 验证：抓取一个详情页确认能看到内容
  console.log("\n验证登录状态...");
  const testHtml = await fetchHtml(
    `${BASE_URL}/forum-post/815.html`,
    config.timeout,
  );
  const testHidden =
    testHtml.includes("该版块内容已隐藏") ||
    testHtml.includes("请登录后查看");

  if (testHidden) {
    console.log("✗ 登录验证失败，cookie 可能无效");
    process.exit(1);
  }
  console.log("✓ 登录验证成功，可以访问隐藏内容");

  // 单页调试模式
  if (config.single) {
    console.log(`\n单页调试: ${config.single}`);
    const info = await extractImagePost(config.single, config.timeout);
    console.log("─".repeat(50));
    console.log(`标题: ${info.title}`);
    console.log(`描述: ${info.description.slice(0, 100)}${info.description.length > 100 ? "..." : ""}`);
    console.log(`标签: ${info.tags.join(", ") || "（无）"}`);
    console.log(`图片数: ${info.images.length}`);
    if (info.images.length > 0) {
      info.images.slice(0, 8).forEach((url, i) => console.log(`  [${i + 1}] ${url}`));
      if (info.images.length > 8) console.log(`  ... 还有 ${info.images.length - 8} 张`);
    }
    if (info.error) console.log(`错误: ${info.error}`);
    return;
  }

  // ── 2) 发现文章 ──
  console.log("\n" + "═".repeat(50));
  console.log("步骤 2: 发现图片合集");
  console.log("═".repeat(50));

  const postUrls = await discoverImagePosts(
    config.maxPages,
    config.startPage,
    config.timeout,
  );
  console.log(`\n共发现 ${postUrls.length} 篇文章`);

  if (postUrls.length === 0) {
    console.log("未找到任何文章");
    process.exit(1);
  }

  // ── 3) 抓取详情 ──
  console.log("\n" + "═".repeat(50));
  console.log("步骤 3: 抓取图片详情");
  console.log("═".repeat(50));

  const tasks = postUrls.map(
    (url) => () => extractImagePost(url, config.timeout),
  );

  const posts = await poolAll(
    tasks,
    config.concurrency,
    (result, done, total) => {
      const status = result.error
        ? `✗ ${result.error}`
        : result.images.length > 0
          ? `✓ ${result.images.length} 张图片`
          : "✗ 无图片";
      const name = result.title ? result.title.slice(0, 40) : "未知";
      console.log(`[${done}/${total}] ${name} ${status}`);
    },
  );

  // ── 4) 统计 & 导出 ──
  console.log("\n" + "═".repeat(50));
  console.log("结果");
  console.log("═".repeat(50));

  const validPosts = posts.filter(
    (p) => p.title && !p.error && p.images.length > 0,
  );
  const noImagePosts = posts.filter(
    (p) => p.title && !p.error && p.images.length === 0,
  );
  const errorPosts = posts.filter((p) => p.error);
  const totalImages = validPosts.reduce((sum, p) => sum + p.images.length, 0);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  console.log(`抓取完成 (${elapsed}s):`);
  console.log(`  有效图片帖: ${validPosts.length}`);
  console.log(`  总图片数: ${totalImages}`);
  console.log(`  无图片: ${noImagePosts.length}`);
  console.log(`  失败: ${errorPosts.length}`);

  if (errorPosts.length > 0) {
    console.log("\n失败详情:");
    for (const p of errorPosts) {
      console.log(`  ${p.pageUrl} → ${p.error}`);
    }
  }

  if (validPosts.length > 0) {
    const outputFile = exportToJson(posts);
    console.log(`\n已保存到: ${outputFile}`);
    console.log("可在上传页「图片 → JSON 导入」中使用此文件");
  } else {
    console.log("\n未抓取到有效数据");
  }
}

main().catch((e) => {
  console.error("致命错误:", e);
  process.exit(1);
});
