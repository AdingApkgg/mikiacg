import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";
import { COVER_CONFIG } from "@/lib/cover-config";

export type CoverFormat = (typeof COVER_CONFIG.formats)[number];

type FfmpegResult = { ok: boolean; stderr: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    console.log(`[ffmpeg] 执行: ffmpeg ${args.slice(0, 6).join(" ")}...`);
    const ffmpeg = spawn("ffmpeg", args);
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        console.log(`[ffmpeg] 超时 (${timeoutMs}ms)，终止进程`);
        ffmpeg.kill("SIGKILL");
      }
    }, timeoutMs);

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        console.log(`[ffmpeg] 退出码: ${code}, 错误: ${stderr.slice(-200)}`);
      }
      resolve({ ok: code === 0, stderr });
    });

    ffmpeg.on("error", (err) => {
      settled = true;
      clearTimeout(timer);
      console.log(`[ffmpeg] 启动失败:`, err);
      resolve({ ok: false, stderr: String(err) });
    });
  });
}

async function generateFrameAtTime(
  videoUrl: string,
  timeSec: number,
  outputPath: string,
  width: number,
  timeoutMs: number
): Promise<boolean> {
  const args = [
    "-ss", String(timeSec),
    "-i", videoUrl,
    "-vframes", "1",
    "-vf", `scale=${width}:-2`,
    "-q:v", "4",
    "-y",
    outputPath,
  ];
  const result = await runFfmpeg(args, timeoutMs);
  return result.ok;
}

async function analyzeFrame(filePath: string) {
  const stats = await sharp(filePath).stats();
  const red = stats.channels[0];
  const green = stats.channels[1];
  const blue = stats.channels[2];

  const mean =
    red && green && blue
      ? (red.mean + green.mean + blue.mean) / 3
      : stats.channels[0]?.mean ?? 0;

  const stddev =
    red && green && blue
      ? (red.stdev + green.stdev + blue.stdev) / 3
      : stats.channels[0]?.stdev ?? 0;

  const tooDark = mean < 10;
  const tooBright = mean > 245;
  const valid = !tooDark && !tooBright;

  const brightnessScore = 1 - Math.min(1, Math.abs(mean - 128) / 128);
  const contrastScore = Math.min(1, stddev / 64);
  const score = brightnessScore * 0.7 + contrastScore * 0.3;

  return { mean, stddev, score, valid };
}

export async function selectBestFrameTime(
  videoUrl: string,
  samplePoints: readonly number[] = COVER_CONFIG.samplePoints,
  timeoutMs: number = COVER_CONFIG.timeout
): Promise<number | null> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cover-frames-"));
  let bestTime: number | null = null;
  let bestScore = -1;

  try {
    for (const timeSec of samplePoints) {
      const framePath = path.join(tempDir, `frame-${timeSec}.jpg`);
      const ok = await generateFrameAtTime(
        videoUrl,
        timeSec,
        framePath,
        320,
        Math.min(timeoutMs, 15000)
      );
      if (!ok) continue;

      try {
        const { score, valid } = await analyzeFrame(framePath);
        if (valid && score > bestScore) {
          bestScore = score;
          bestTime = timeSec;
        }
      } catch {
        // 忽略分析失败的帧
      }
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  return bestTime;
}

async function generateCoverAtTime(
  videoUrl: string,
  outputPath: string,
  format: CoverFormat,
  timeSec: number,
  width: number,
  timeoutMs: number
): Promise<boolean> {
  // 输入选项 (在 -i 之前)
  const inputArgs = ["-ss", String(timeSec), "-i", videoUrl];
  // 基础输出选项 (在 -i 之后, 输出文件之前)
  const baseOutputArgs = ["-vframes", "1", "-vf", `scale=${width}:-2`];

  if (format === "avif") {
    const aom = await runFfmpeg(
      [...inputArgs, ...baseOutputArgs, "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "30", "-y", outputPath],
      timeoutMs
    );
    if (aom.ok) return true;
    const svt = await runFfmpeg(
      [...inputArgs, ...baseOutputArgs, "-c:v", "libsvtav1", "-crf", "35", "-y", outputPath],
      timeoutMs
    );
    return svt.ok;
  }

  if (format === "webp") {
    const webp = await runFfmpeg(
      [...inputArgs, ...baseOutputArgs, "-c:v", "libwebp", "-quality", "85", "-y", outputPath],
      timeoutMs
    );
    return webp.ok;
  }

  const jpg = await runFfmpeg(
    [...inputArgs, ...baseOutputArgs, "-q:v", "2", "-y", outputPath],
    timeoutMs
  );
  return jpg.ok;
}

export async function generateCoverWithSmartFrame(
  videoUrl: string,
  outputPath: string,
  format: CoverFormat,
  options?: {
    width?: number;
    samplePoints?: readonly number[];
    timeoutMs?: number;
    fallbackTime?: number;
  }
): Promise<boolean> {
  const width = options?.width ?? COVER_CONFIG.width;
  const samplePoints = options?.samplePoints ?? COVER_CONFIG.samplePoints;
  const timeoutMs = options?.timeoutMs ?? COVER_CONFIG.timeout;
  const fallbackTime = options?.fallbackTime ?? samplePoints[0] ?? 1;

  const bestTime = await selectBestFrameTime(videoUrl, samplePoints, timeoutMs);
  const timeToUse = bestTime ?? fallbackTime;

  const ok = await generateCoverAtTime(
    videoUrl,
    outputPath,
    format,
    timeToUse,
    width,
    timeoutMs
  );

  if (ok) return true;

  if (bestTime !== fallbackTime) {
    return generateCoverAtTime(
      videoUrl,
      outputPath,
      format,
      fallbackTime,
      width,
      timeoutMs
    );
  }

  return false;
}

export async function retryGenerateCover(
  videoUrl: string,
  outputPath: string,
  format: CoverFormat,
  options?: {
    width?: number;
    samplePoints?: readonly number[];
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  }
): Promise<boolean> {
  const maxRetries = options?.maxRetries ?? COVER_CONFIG.maxRetries;
  const retryDelayMs = options?.retryDelayMs ?? COVER_CONFIG.retryDelay;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const ok = await generateCoverWithSmartFrame(videoUrl, outputPath, format, {
      width: options?.width,
      samplePoints: options?.samplePoints,
      timeoutMs: options?.timeoutMs,
    });
    if (ok) return true;

    attempt += 1;
    if (attempt <= maxRetries) {
      await sleep(retryDelayMs);
    }
  }

  return false;
}
