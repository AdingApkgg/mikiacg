import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { COVER_CONFIG } from "@/lib/cover-config";
import { retryGenerateCover } from "@/lib/cover-generator";
import { addToQueue, processQueue } from "@/lib/cover-queue";

const globalForCoverAuto = globalThis as unknown as {
  coverAutoStarted?: boolean;
  coverBackfillTimer?: NodeJS.Timeout;
};

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const COVER_DIR = path.join(process.cwd(), UPLOAD_DIR, "cover");

async function ensureCoverDir() {
  try {
    await fs.access(COVER_DIR);
  } catch {
    await fs.mkdir(COVER_DIR, { recursive: true });
  }
}

async function tryAcquireBackfillLock(): Promise<boolean> {
  const result = await redis.set(
    "cover:backfill:lock",
    "1",
    "EX",
    COVER_CONFIG.backfillLockTtlSeconds,
    "NX"
  );
  return result === "OK";
}

async function backfillMissingCovers(): Promise<void> {
  const locked = await tryAcquireBackfillLock();
  if (!locked) return;

  const videos = await prisma.video.findMany({
    where: {
      OR: [{ coverUrl: null }, { coverUrl: "" }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: COVER_CONFIG.backfillBatchSize,
  });

  for (const video of videos) {
    await addToQueue(video.id);
  }
}

async function coverWorker() {
  console.log("[CoverWorker] 启动封面生成 worker...");
  await processQueue(async (videoId) => {
    console.log(`[CoverWorker] 处理视频 ${videoId}`);
    await ensureCoverDir();
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { videoUrl: true },
    });

    if (!video?.videoUrl) {
      console.log(`[CoverWorker] 视频 ${videoId} 无 videoUrl，跳过`);
      return true;
    }

    console.log(`[CoverWorker] 视频 ${videoId} URL: ${video.videoUrl.slice(0, 80)}...`);

    for (const format of COVER_CONFIG.formats) {
      const coverFileName = `${videoId}.${format}`;
      const coverFilePath = path.join(COVER_DIR, coverFileName);
      console.log(`[CoverWorker] 尝试生成 ${format} 格式封面...`);
      const ok = await retryGenerateCover(video.videoUrl, coverFilePath, format, {
        width: COVER_CONFIG.width,
        samplePoints: [...COVER_CONFIG.samplePoints],
        timeoutMs: COVER_CONFIG.timeout,
        maxRetries: COVER_CONFIG.maxRetries,
        retryDelayMs: COVER_CONFIG.retryDelay,
      });
      if (ok) {
        const coverUrl = `/uploads/cover/${coverFileName}`;
        console.log(`[CoverWorker] ✓ 视频 ${videoId} 封面生成成功: ${coverUrl}`);
        try {
          await prisma.video.update({
            where: { id: videoId },
            data: { coverUrl },
          });
        } catch (e) {
          console.error(`[CoverWorker] 更新数据库失败:`, e);
        }
        return true;
      }
      console.log(`[CoverWorker] ${format} 格式生成失败`);
    }

    console.log(`[CoverWorker] ✗ 视频 ${videoId} 所有格式都失败`);
    return false;
  });
}

export function ensureCoverAuto() {
  if (globalForCoverAuto.coverAutoStarted) return;
  globalForCoverAuto.coverAutoStarted = true;

  void coverWorker();
  void backfillMissingCovers();

  globalForCoverAuto.coverBackfillTimer = setInterval(() => {
    void backfillMissingCovers();
  }, COVER_CONFIG.backfillIntervalMs);
}

export async function enqueueCoverForVideo(
  videoId: string,
  coverUrl?: string | null
): Promise<void> {
  if (coverUrl) return;
  ensureCoverAuto();
  await addToQueue(videoId);
}
