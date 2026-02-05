/**
 * 封面图片代理和缓存 API
 * 
 * 功能：
 * 1. 代理外部图片（解决 CORS 问题）
 * 2. 本地缓存图片（减少重复请求）
 * 3. 自动从视频生成封面（使用 ffmpeg）
 * 
 * 使用方式：
 * - /api/cover/https://example.com/image.jpg - 代理外部图片
 * - /api/cover/video/123456 - 自动生成视频封面
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { ensureCoverAuto, enqueueCoverForVideo } from "@/lib/cover-auto";

// 封面存储目录（本地 uploads）
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const COVER_DIR = path.join(process.cwd(), UPLOAD_DIR, "cover");
// 外部图片缓存目录
const CACHE_DIR = path.join(process.cwd(), "public", "cache", "covers");

// 确保目录存在
async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function ensureCacheDir() {
  await ensureDir(CACHE_DIR);
}

async function ensureCoverDir() {
  await ensureDir(COVER_DIR);
}

// 生成缓存文件名
function getCacheFileName(url: string): string {
  const hash = crypto.createHash("md5").update(url).digest("hex");
  const ext = getExtension(url);
  return `${hash}${ext}`;
}

// 获取文件扩展名
function getExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = path.extname(pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"].includes(ext)) {
      return ext;
    }
  } catch {
    // ignore
  }
  return ".jpg"; // 默认
}

// 获取 Content-Type
function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  return types[ext] || "image/jpeg";
}

// 根据 Accept 头确定客户端支持的最佳格式
function getPreferredFormat(acceptHeader: string | null): { ext: string; contentType: string }[] {
  const formats: { ext: string; contentType: string; priority: number }[] = [];
  
  // 检查 AVIF 支持
  if (acceptHeader?.includes("image/avif")) {
    formats.push({ ext: ".avif", contentType: "image/avif", priority: 1 });
  }
  
  // 检查 WebP 支持
  if (acceptHeader?.includes("image/webp")) {
    formats.push({ ext: ".webp", contentType: "image/webp", priority: 2 });
  }
  
  // JPEG 总是支持的
  formats.push({ ext: ".jpg", contentType: "image/jpeg", priority: 3 });
  
  // 按优先级排序
  return formats.sort((a, b) => a.priority - b.priority);
}


// 尝试常见的缩略图 URL 模式（某些 CDN 支持）
async function tryFetchThumbnailFromCDN(videoUrl: string): Promise<Buffer | null> {
  const thumbPatterns = [
    videoUrl.replace(/\.mp4$/i, "_thumb.jpg"),
    videoUrl.replace(/\.mp4$/i, ".jpg"),
    videoUrl.replace(/\.mp4$/i, "_poster.jpg"),
    `${videoUrl}?x-oss-process=video/snapshot,t_1000,m_fast`,
  ];

  for (const thumbUrl of thumbPatterns) {
    try {
      const response = await fetch(thumbUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000), // 5 秒超时
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.startsWith("image/")) {
          return Buffer.from(await response.arrayBuffer());
        }
      }
    } catch {
      // 继续尝试下一个模式
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  
  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  await ensureCacheDir();

  // 处理视频封面请求：/api/cover/video/123456
  if (pathSegments[0] === "video" && pathSegments[1]) {
    const videoId = pathSegments[1];
    
    // 查询视频信息
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { coverUrl: true, videoUrl: true },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // 如果有封面 URL，代理它
    if (video.coverUrl) {
      const cacheFile = path.join(CACHE_DIR, getCacheFileName(video.coverUrl));
      
      // 检查缓存
      try {
        const cached = await fs.readFile(cacheFile);
        const ext = path.extname(cacheFile);
        return new Response(new Uint8Array(cached), {
          headers: {
            "Content-Type": getContentType(ext),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        // 缓存不存在，获取并缓存
      }

      // 获取外部图片
      try {
        const response = await fetch(video.coverUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // 保存到缓存
          await fs.writeFile(cacheFile, buffer);

          const contentType = response.headers.get("content-type") || "image/jpeg";
          return new Response(new Uint8Array(arrayBuffer), {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      } catch {
        // 继续尝试从视频生成
      }
    }

    // 确保封面目录存在
    await ensureCoverDir();

    // 根据客户端支持的格式选择最佳格式
    const acceptHeader = request.headers.get("accept");
    const preferredFormats = getPreferredFormat(acceptHeader);

    // 检查本地封面是否已存在（按偏好顺序查找）
    for (const format of preferredFormats) {
      const coverFileName = `${videoId}${format.ext}`;
      const coverFilePath = path.join(COVER_DIR, coverFileName);
      try {
        const cached = await fs.readFile(coverFilePath);
        return new Response(new Uint8Array(cached), {
          headers: {
            "Content-Type": format.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Vary": "Accept",
          },
        });
      } catch {
        // 尝试下一个格式
      }
    }

    // 方案 1: 尝试从 CDN 获取缩略图（作为后备）
    const cdnThumbnail = await tryFetchThumbnailFromCDN(video.videoUrl);
    if (cdnThumbnail) {
      // CDN 返回的通常是 JPEG，保存到 uploads/cover/
      const cdnCoverPath = path.join(COVER_DIR, `${videoId}.jpg`);
      await fs.writeFile(cdnCoverPath, cdnThumbnail);
      
      return new Response(new Uint8Array(cdnThumbnail), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "Vary": "Accept",
        },
      });
    }

    // 方案 2: 加入队列异步生成
    ensureCoverAuto();
    await enqueueCoverForVideo(videoId);

    return NextResponse.json(
      { status: "queued" },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "5",
        },
      }
    );
  }

  // 代理外部图片：/api/cover/https://example.com/image.jpg
  // 注意：前端可能 encodeURIComponent 了整个路径，需要解码
  const rawImageUrl = pathSegments.join("/");
  const imageUrl = decodeURIComponent(rawImageUrl);

  // 处理本地 uploads 路径：/api/cover//uploads/cover/xxx.jpg
  const normalizedLocalPath = imageUrl.startsWith("/")
    ? imageUrl.slice(1)
    : imageUrl;
  const uploadsRoot = path.join(process.cwd(), UPLOAD_DIR);
  const candidateLocalPath = path.join(process.cwd(), normalizedLocalPath);
  if (
    normalizedLocalPath.startsWith("uploads/") &&
    candidateLocalPath.startsWith(uploadsRoot)
  ) {
    try {
      const cached = await fs.readFile(candidateLocalPath);
      const ext = path.extname(candidateLocalPath);
      return new Response(new Uint8Array(cached), {
        headers: {
          "Content-Type": getContentType(ext),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return NextResponse.json({ error: "Local image not found" }, { status: 404 });
    }
  }
  
  // 验证 URL
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const cacheFile = path.join(CACHE_DIR, getCacheFileName(imageUrl));
  
  // 检查缓存
  try {
    const cached = await fs.readFile(cacheFile);
    const ext = path.extname(cacheFile);
    return new Response(new Uint8Array(cached), {
      headers: {
        "Content-Type": getContentType(ext),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // 缓存不存在
  }

  // 获取外部图片
  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 400 });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 保存到缓存
    await fs.writeFile(cacheFile, buffer);

    return new Response(new Uint8Array(arrayBuffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}
