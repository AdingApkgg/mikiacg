/**
 * 批量生成视频封面（独立脚本，不依赖服务器）
 * 
 * 依赖: ffmpeg (需要系统安装)
 * 运行方式: npx tsx scripts/generate-covers.ts
 * 
 * 可选参数:
 *   --force          强制重新生成所有封面（包括已有封面的视频）
 *   --dry-run        仅显示将要处理的视频，不实际生成
 *   --limit=N        限制处理的视频数量（用于测试）
 *   --concurrency=N  并发处理数量（默认 2）
 *   --resume         断点续传（跳过已成功处理的记录）
 */

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { COVER_CONFIG } from "../src/lib/cover-config";
import { retryGenerateCover } from "../src/lib/cover-generator";
import { redis } from "../src/lib/redis";

// 加载环境变量
dotenv.config({ path: ".env.development" });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.production" });
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// 封面存储目录
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const COVER_DIR = join(UPLOAD_DIR, "cover");

// 解析命令行参数
const args = process.argv.slice(2);
const forceRegenerate = args.includes("--force");
const dryRun = args.includes("--dry-run");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
const concurrency = concurrencyArg
  ? parseInt(concurrencyArg.split("=")[1], 10)
  : COVER_CONFIG.maxConcurrency;
const resume = args.includes("--resume");

// 检查 ffmpeg 是否可用
function checkFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const progressKey = COVER_CONFIG.progressKey;
const progressMetaKey = `${progressKey}:meta`;
const progressDoneKey = `${progressKey}:done`;

async function resetProgress() {
  await redis.del(progressMetaKey);
  await redis.del(progressDoneKey);
}

async function markProgress(videoId: string, success: boolean) {
  if (success) {
    await redis.sadd(progressDoneKey, videoId);
  }
  await redis.hincrby(progressMetaKey, success ? "success" : "error", 1);
  await redis.hset(progressMetaKey, "updatedAt", String(Date.now()));
}

async function hasProgress(videoId: string): Promise<boolean> {
  const exists = await redis.sismember(progressDoneKey, videoId);
  return exists === 1;
}

async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  limitCount: number
) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limitCount) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log("🎬 视频封面批量生成工具\n");

  // 检查 ffmpeg
  if (!checkFfmpeg()) {
    console.error("❌ 错误: 未找到 ffmpeg，请先安装 ffmpeg");
    console.error("   macOS: brew install ffmpeg");
    console.error("   Ubuntu: sudo apt install ffmpeg");
    process.exit(1);
  }
  console.log("✅ ffmpeg 可用\n");

  // 确保封面目录存在
  if (!existsSync(COVER_DIR)) {
    mkdirSync(COVER_DIR, { recursive: true });
    console.log(`📁 创建封面目录: ${COVER_DIR}\n`);
  }

  // 获取视频列表
  const whereClause = forceRegenerate
    ? {}
    : {
        OR: [
          { coverUrl: null },
          { coverUrl: "" },
        ],
      };

  const videos = await prisma.video.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      videoUrl: true,
      coverUrl: true,
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  if (videos.length === 0) {
    console.log("✨ 所有视频都已有封面，无需处理");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  console.log(`📋 找到 ${videos.length} 个需要生成封面的视频\n`);

  if (dryRun) {
    console.log("🔍 Dry Run 模式 - 仅显示将要处理的视频:\n");
    for (const video of videos) {
      console.log(`  [${video.id}] ${video.title}`);
      console.log(`       视频: ${video.videoUrl}`);
      console.log(`       当前封面: ${video.coverUrl || "(无)"}\n`);
    }
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  if (!resume) {
    await resetProgress();
  }
  await redis.hset(progressMetaKey, "total", String(videos.length));

  // 处理每个视频
  let successCount = 0;
  let errorCount = 0;

  // 尝试的格式顺序：AVIF > WebP > JPEG
  const formats = COVER_CONFIG.formats;

  await runWithConcurrency(
    videos,
    async (video, index) => {
      if (resume && (await hasProgress(video.id))) {
        return;
      }

      const progress = `[${index + 1}/${videos.length}]`;
      console.log(`${progress} 处理: ${video.title}`);

      let success = false;
      let finalCoverUrl = "";

      for (const ext of formats) {
        const coverFilename = `${video.id}.${ext}`;
        const coverPath = join(COVER_DIR, coverFilename);
        const coverUrl = `/uploads/cover/${coverFilename}`;

        console.log(`  🖼️  尝试生成 ${ext.toUpperCase()} 格式...`);

        const ok = await retryGenerateCover(video.videoUrl, coverPath, ext, {
          width: COVER_CONFIG.width,
          samplePoints: [...COVER_CONFIG.samplePoints],
          timeoutMs: COVER_CONFIG.timeout,
          maxRetries: COVER_CONFIG.maxRetries,
          retryDelayMs: COVER_CONFIG.retryDelay,
        });

        if (ok && existsSync(coverPath)) {
          finalCoverUrl = coverUrl;
          success = true;
          break;
        }
      }

      if (success) {
        await prisma.video.update({
          where: { id: video.id },
          data: { coverUrl: finalCoverUrl },
        });
        console.log(`  ✅ 成功: ${finalCoverUrl}`);
        successCount++;
      } else {
        console.log("  ❌ 失败: 无法生成封面");
        errorCount++;
      }

      await markProgress(video.id, success);
    },
    concurrency
  );

  // 输出统计
  console.log("\n📊 统计:");
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${errorCount}`);

  await prisma.$disconnect();
  await pool.end();
  console.log("\n✨ 完成!");
}

main().catch((error) => {
  console.error("发生错误:", error);
  process.exit(1);
});
