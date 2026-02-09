import * as fs from "fs/promises";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { COVER_CONFIG } from "@/lib/cover-config";
import { generateCoverForVideo } from "@/lib/cover-generator";
import { addToQueue, addToQueueBatch, processQueue } from "@/lib/cover-queue";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const COVER_DIR = path.join(process.cwd(), UPLOAD_DIR, "cover");

function log(msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.log(`[${ts}][CoverWorker] ${msg}`, ...args);
}

// 封面目录只需创建一次
let coverDirReady = false;
async function ensureCoverDir() {
  if (coverDirReady) return;
  await fs.mkdir(COVER_DIR, { recursive: true }).catch(() => {});
  coverDirReady = true;
}

/**
 * 检查本地是否已存在封面文件
 * 优化: 使用 Promise.all 并行检查所有格式
 */
async function findExistingCover(videoId: string): Promise<string | null> {
  const checks = COVER_CONFIG.formats.map(async (format) => {
    const filePath = path.join(COVER_DIR, `${videoId}.${format}`);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 0) {
        return `/uploads/cover/${videoId}.${format}`;
      }
    } catch {
      // 文件不存在，继续
    }
    return null;
  });

  const results = await Promise.all(checks);
  return results.find((r) => r !== null) ?? null;
}

/**
 * 处理单个视频的封面生成
 */
async function processVideo(videoId: string): Promise<boolean> {
  log(`处理视频 ${videoId}`);
  await ensureCoverDir();

  // 先检查文件是否已存在（避免重复生成）
  const existing = await findExistingCover(videoId);
  if (existing) {
    log(`视频 ${videoId} 封面已存在: ${existing}，更新数据库`);
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { coverUrl: existing },
      });
    } catch (e) {
      log(`更新数据库失败:`, e);
    }
    return true;
  }

  // 获取视频信息
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { videoUrl: true },
  });

  if (!video?.videoUrl) {
    log(`视频 ${videoId} 无 videoUrl，跳过`);
    return true;
  }

  log(`视频 ${videoId} URL: ${video.videoUrl.slice(0, 80)}...`);

  // 使用优化后的封面生成流程
  const coverUrl = await generateCoverForVideo(
    video.videoUrl,
    videoId,
    COVER_DIR,
    {
      width: COVER_CONFIG.width,
      timeoutMs: COVER_CONFIG.timeout,
      maxRetries: COVER_CONFIG.maxRetries,
      retryDelayMs: COVER_CONFIG.retryDelay,
    }
  );

  if (coverUrl) {
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { coverUrl },
      });
    } catch (e) {
      log(`更新数据库失败:`, e);
    }
    return true;
  }

  return false;
}

// ========== Worker 生命周期 ==========

let workerStarted = false;

/**
 * 启动封面生成 Worker
 * 由 instrumentation.ts 在服务器启动时调用
 */
export function startCoverWorker() {
  if (workerStarted) return;
  workerStarted = true;

  log("启动封面生成 worker...");
  // 预创建目录，避免每个任务都检查
  void ensureCoverDir();
  void processQueue(processVideo);
}

// ========== 补全调度 ==========

let backfillTimer: NodeJS.Timeout | null = null;

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

  if (videos.length > 0) {
    log(`补全: 找到 ${videos.length} 个缺少封面的视频`);
    // 批量入队（1 次 pipeline 获取锁 + 1 次 pipeline 入队，替代 N 次循环）
    const count = await addToQueueBatch(videos.map((v) => v.id));
    log(`补全: 成功入队 ${count} 个视频`);
  }
}

/**
 * 启动定时补全调度器
 * 由 instrumentation.ts 在服务器启动时调用
 */
export function startBackfillScheduler() {
  if (backfillTimer) return;

  void backfillMissingCovers();
  backfillTimer = setInterval(() => {
    void backfillMissingCovers();
  }, COVER_CONFIG.backfillIntervalMs);
}

// ========== 公共 API ==========

/**
 * 将视频加入封面生成队列
 * 供 tRPC mutation 和 API route 调用
 */
export async function enqueueCoverForVideo(
  videoId: string,
  coverUrl?: string | null
): Promise<void> {
  if (coverUrl) return;
  await addToQueue(videoId);
}
