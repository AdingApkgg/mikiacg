/**
 * 批量生成视频封面（独立脚本，不依赖服务器）
 * 
 * 依赖: ffmpeg (需要系统安装)
 * 运行方式: npx tsx scripts/generate-covers.ts
 * 
 * 可选参数:
 *   --force      强制重新生成所有封面（包括已有封面的视频）
 *   --dry-run    仅显示将要处理的视频，不实际生成
 *   --limit=N    限制处理的视频数量（用于测试）
 */

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

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
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

// 检查 ffmpeg 是否可用
function checkFfmpeg(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// 使用 ffmpeg 生成封面（支持多种格式，按优先级尝试）
async function generateCover(
  videoUrl: string,
  outputPath: string
): Promise<boolean> {
  const runFfmpeg = (formatArgs: string[]): Promise<boolean> =>
    new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-ss", "5",           // 从第 5 秒开始
        "-i", videoUrl,       // 输入 URL
        "-vframes", "1",      // 只截取 1 帧
        "-vf", "scale=1280:-2", // 缩放到 1280 宽度
        ...formatArgs,
        "-y",                 // 覆盖输出
        outputPath,
      ], {
        timeout: 60000, // 60 秒超时
      });

      ffmpeg.on("close", (code) => {
        resolve(code === 0);
      });

      ffmpeg.on("error", () => {
        resolve(false);
      });
    });

  // 尝试 AVIF (最优先)
  if (outputPath.endsWith(".avif")) {
    // 优先 libaom-av1，失败则尝试 libsvtav1
    if (await runFfmpeg(["-c:v", "libaom-av1", "-still-picture", "1", "-crf", "30"])) {
      return true;
    }
    if (await runFfmpeg(["-c:v", "libsvtav1", "-crf", "35"])) {
      return true;
    }
    return false;
  }

  // 尝试 WebP
  if (outputPath.endsWith(".webp")) {
    return runFfmpeg(["-c:v", "libwebp", "-quality", "85"]);
  }

  // JPEG (默认)
  return runFfmpeg(["-q:v", "2"]);
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

  // 处理每个视频
  let successCount = 0;
  let errorCount = 0;

  // 尝试的格式顺序：AVIF > WebP > JPEG
  const formats = [".avif", ".webp", ".jpg"];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${i + 1}/${videos.length}]`;

    console.log(`${progress} 处理: ${video.title}`);

    let success = false;
    let finalCoverUrl = "";

    // 按格式优先级尝试
    for (const ext of formats) {
      const coverFilename = `${video.id}${ext}`;
      const coverPath = join(COVER_DIR, coverFilename);
      const coverUrl = `/uploads/cover/${coverFilename}`;

      console.log(`  🖼️  尝试生成 ${ext.toUpperCase().slice(1)} 格式...`);
      
      if (await generateCover(video.videoUrl, coverPath)) {
        if (existsSync(coverPath)) {
          finalCoverUrl = coverUrl;
          success = true;
          break;
        }
      }
    }

    if (success) {
      // 更新数据库
      await prisma.video.update({
        where: { id: video.id },
        data: { coverUrl: finalCoverUrl },
      });
      console.log(`  ✅ 成功: ${finalCoverUrl}`);
      successCount++;
    } else {
      console.log(`  ❌ 失败: 无法生成封面`);
      errorCount++;
    }
  }

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
