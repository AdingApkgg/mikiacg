import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
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

  let statsSection = "";
  let videoTagsSection = "";
  let gameTagsSection = "";
  let imageTagsSection = "";
  let recentVideosSection = "";
  let recentGamesSection = "";
  let recentImagesSection = "";

  try {
    const [videoCount, gameCount, imageCount, userCount, tagCount] = await Promise.all([
      prisma.video.count({ where: { status: "PUBLISHED" } }),
      prisma.game.count({ where: { status: "PUBLISHED" } }),
      prisma.imagePost.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count(),
      prisma.tag.count(),
    ]);

    statsSection = `
## 网站统计

- 视频数量: ${videoCount}
- 游戏数量: ${gameCount}
- 图片数量: ${imageCount}
- 注册用户: ${userCount}
- 标签数量: ${tagCount}
`;

    // 热门视频标签
    const popularVideoTags = await prisma.tag.findMany({
      where: { videos: { some: {} } },
      orderBy: { videos: { _count: "desc" } },
      take: 20,
      select: {
        name: true,
        slug: true,
        _count: { select: { videos: true } },
      },
    });

    if (popularVideoTags.length > 0) {
      videoTagsSection = `
## 热门视频标签

${popularVideoTags.map((tag) => `- [${tag.name}](${baseUrl}/video/tag/${tag.slug}) (${tag._count.videos} 个视频)`).join("\n")}
`;
    }

    // 热门游戏标签
    const popularGameTags = await prisma.tag.findMany({
      where: { games: { some: {} } },
      orderBy: { games: { _count: "desc" } },
      take: 20,
      select: {
        name: true,
        slug: true,
        _count: { select: { games: true } },
      },
    });

    if (popularGameTags.length > 0) {
      gameTagsSection = `
## 热门游戏标签

${popularGameTags.map((tag) => `- [${tag.name}](${baseUrl}/game/tag/${tag.slug}) (${tag._count.games} 个游戏)`).join("\n")}
`;
    }

    // 热门图片标签
    const popularImageTags = await prisma.tag.findMany({
      where: { imagePosts: { some: {} } },
      orderBy: { imagePosts: { _count: "desc" } },
      take: 20,
      select: {
        name: true,
        slug: true,
        _count: { select: { imagePosts: true } },
      },
    });

    if (popularImageTags.length > 0) {
      imageTagsSection = `
## 热门图片标签

${popularImageTags.map((tag) => `- [${tag.name}](${baseUrl}/image/tag/${tag.slug}) (${tag._count.imagePosts} 个图片)`).join("\n")}
`;
    }

    // 最新视频
    const recentVideos = await prisma.video.findMany({
      where: { status: "PUBLISHED" },
      orderBy: videoPublicationOrderBy,
      take: 10,
      select: {
        id: true,
        title: true,
        description: true,
        views: true,
        createdAt: true,
        publishedAt: true,
        uploader: { select: { nickname: true, username: true } },
      },
    });

    if (recentVideos.length > 0) {
      recentVideosSection = `
## 最新视频

${recentVideos
  .map(
    (video) => `### ${video.title}
- URL: ${baseUrl}/video/${video.id}
- 上传者: ${video.uploader.nickname || video.uploader.username}
- 观看次数: ${video.views}
- 发表时间: ${publicationDate(video).toISOString().split("T")[0]}
${video.description ? `- 简介: ${video.description.slice(0, 200)}${video.description.length > 200 ? "..." : ""}` : ""}
`,
  )
  .join("\n")}
`;
    }

    // 最新游戏
    const recentGames = await prisma.game.findMany({
      where: { status: "PUBLISHED" },
      orderBy: gamePublicationOrderBy,
      take: 10,
      select: {
        id: true,
        title: true,
        description: true,
        gameType: true,
        isFree: true,
        version: true,
        views: true,
        createdAt: true,
        publishedAt: true,
        uploader: { select: { nickname: true, username: true } },
      },
    });

    if (recentGames.length > 0) {
      recentGamesSection = `
## 最新游戏

${recentGames
  .map(
    (game) => `### ${game.title}
- URL: ${baseUrl}/game/${game.id}
- 类型: ${game.gameType || "未分类"}${game.isFree ? "" : " (付费)"}${game.version ? ` ${game.version}` : ""}
- 上传者: ${game.uploader.nickname || game.uploader.username}
- 浏览次数: ${game.views}
- 发表时间: ${publicationDate(game).toISOString().split("T")[0]}
${game.description ? `- 简介: ${game.description.slice(0, 200)}${game.description.length > 200 ? "..." : ""}` : ""}
`,
  )
  .join("\n")}
`;
    }

    // 最新图片
    const recentImages = await prisma.imagePost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: imagePublicationOrderBy,
      take: 10,
      select: {
        id: true,
        title: true,
        description: true,
        images: true,
        views: true,
        createdAt: true,
        publishedAt: true,
        uploader: { select: { nickname: true, username: true } },
      },
    });

    if (recentImages.length > 0) {
      recentImagesSection = `
## 最新图片

${recentImages
  .map(
    (image) => `### ${image.title}
- URL: ${baseUrl}/image/${image.id}
- 图片数量: ${(image.images as string[]).length}
- 上传者: ${image.uploader.nickname || image.uploader.username}
- 浏览次数: ${image.views}
- 发表时间: ${publicationDate(image).toISOString().split("T")[0]}
${image.description ? `- 简介: ${image.description.slice(0, 200)}${image.description.length > 200 ? "..." : ""}` : ""}
`,
  )
  .join("\n")}
`;
    }
  } catch (error) {
    console.warn("llms-full.txt: Database unavailable", error);
  }

  const content = `# ${siteName} - 完整信息

> 本文件提供给 AI 代理和大语言模型更详细的网站信息。

## 关于本站

${siteName} 是一个专注于 ACGN（Anime、Comic、Game、Novel）的流式媒体内容分享平台。

### 平台特点

1. **视频分享**: 用户可以分享动画、漫画、游戏、轻小说相关的视频内容
2. **游戏资源**: 提供 ACGN 相关游戏资源分享，支持多种游戏类型（ADV/SLG/RPG/ACT 等）
3. **图片分享**: 用户可以分享 ACGN 相关插画、同人图、壁纸等图片内容
4. **分类系统**: 视频、游戏和图片各自独立的标签体系，方便发现感兴趣的内容
5. **用户互动**: 支持点赞、收藏、评论等社交功能
6. **响应式设计**: 支持桌面和移动设备访问

### 内容类型

#### 视频
- **动画 (Anime)**: 日本动画、国产动画、欧美动画相关视频
- **漫画 (Comic)**: 漫画解说、漫画推荐、漫画改编相关视频
- **游戏 (Game)**: 游戏实况、游戏评测、游戏攻略相关视频
- **轻小说 (Novel)**: 轻小说推荐、轻小说改编、有声书相关视频
- **VOCALOID**: 虚拟歌手、音乐创作相关视频
- **二次元文化**: Cosplay、同人创作、展会相关视频

#### 游戏
- **ADV**: 冒险游戏 / Visual Novel
- **SLG**: 策略游戏
- **RPG**: 角色扮演游戏
- **ACT**: 动作游戏
- **STG**: 射击游戏
- **PZL**: 解谜游戏
- **AVG**: 文字冒险游戏
- **FTG**: 格斗游戏
- **TAB**: 桌游

#### 图片
- **插画**: 原创绘画 / 数字艺术
- **同人图**: Fan Art / 二次创作
- **壁纸**: 桌面壁纸 / 手机壁纸
- **Cosplay**: Cosplay 摄影
- **截图**: 动画 / 游戏截图
${statsSection}${videoTagsSection}${gameTagsSection}${imageTagsSection}${recentVideosSection}${recentGamesSection}${recentImagesSection}
## 技术栈

本站使用以下技术构建：
- 前端: Next.js, React, Tailwind CSS, shadcn/ui
- 后端: Node.js, Prisma ORM, PostgreSQL
- 部署: PM2, Nginx

## 数据访问

### 公开数据源

- **RSS Feed**: ${baseUrl}/feed.xml - 最新视频、游戏和图片订阅
- **Sitemap**: ${baseUrl}/sitemap.xml - 网站地图
- **OpenAPI**: ${baseUrl}/.well-known/openapi.yaml - API 规范

### 页面结构

- 首页 (${baseUrl}): 展示最新和热门视频
- 游戏页 (${baseUrl}/game): 展示游戏资源列表
- 图片页 (${baseUrl}/image): 展示图片帖子列表
- 视频详情 (${baseUrl}/video/{id}): 单个视频详情
- 游戏详情 (${baseUrl}/game/{id}): 单个游戏详情
- 图片详情 (${baseUrl}/image/{id}): 单个图片帖子详情
- 视频标签 (${baseUrl}/video/tag/{slug}): 按标签浏览视频
- 游戏标签 (${baseUrl}/game/tag/{slug}): 按标签浏览游戏
- 图片标签 (${baseUrl}/image/tag/{slug}): 按标签浏览图片
- 标签聚合 (${baseUrl}/tag/{slug}): 查看标签下所有类型内容
- 用户页 (${baseUrl}/user/{id}): 用户主页和上传内容
- 友链 (${baseUrl}/links): 友情链接（含每条友链的累计点击数 clicks、独立访客数 uniqueClicks、最后点击时间 lastClickedAt 统计）
- 搜索页 (${baseUrl}/search?q={query}): 搜索内容

## 使用指南

### 对于 AI 代理

1. 使用 sitemap.xml 发现所有公开页面
2. 使用 RSS feed 获取最新内容更新
3. 视频页面包含完整的 Schema.org VideoObject 结构化数据
4. 游戏页面包含完整的游戏信息结构化数据
5. 图片页面包含完整的图片帖子信息和 Open Graph 元数据
6. 用户页面包含 Schema.org Person 结构化数据

### 对于搜索引擎

1. 所有公开页面都有独立的 meta 标签
2. 支持 Open Graph 和 Twitter Cards
3. 提供完整的结构化数据 (JSON-LD)

## 版权与合规

- 用户上传的内容版权归原作者所有
- 平台遵守相关法律法规，提供侵权投诉渠道
- 如有版权问题，请联系: ${config.contactEmail || ""}

## 联系方式

- 网站: ${baseUrl}
- 邮箱: ${config.contactEmail || ""}

---
Generated: ${new Date().toISOString()}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
