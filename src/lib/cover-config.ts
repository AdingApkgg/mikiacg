export const COVER_CONFIG = {
  /** 最终封面宽度 */
  width: 1280,
  /** 帧分析宽度（仅用于质量评分，越小越快） */
  analysisWidth: 480,
  /** 输出格式优先级 */
  formats: ["avif", "webp", "jpg"] as const,
  /** 默认采样点（秒），会被动态采样覆盖 */
  samplePoints: [1, 3, 5, 10] as const,
  /** 动态采样数量 */
  sampleCount: 4,
  /** 最大并发 worker 数 */
  maxConcurrency: 4,
  /** 单次 ffmpeg 超时（ms） */
  timeout: 30000,
  /** ffprobe 超时（ms）— 仅用于获取时长，超时后使用默认采样点 */
  probeTimeout: 5000,
  /** ffmpeg 流分析限制（微秒）— 限制远程 URL 的流探测时间 */
  analyzeDuration: 2_000_000,
  /** ffmpeg 流探测大小（字节）— 限制远程 URL 的流探测数据量 */
  probeSize: 2_000_000,
  /** 生成失败重试次数 */
  maxRetries: 2,
  /** 重试间隔（ms） */
  retryDelay: 1000,
  /** AVIF 编码 effort (0-9, 越低越快) */
  avifEffort: 2,
  /** AVIF 编码质量 */
  avifQuality: 65,
  /** WebP 编码质量 */
  webpQuality: 82,
  /** JPEG 编码质量 */
  jpegQuality: 88,
  /** Redis lock TTL（秒） */
  lockTtlSeconds: 180,
  /** Redis 队列名 */
  queueName: "cover:queue",
  /** 进度追踪 key */
  progressKey: "cover:progress",
  /** 定时补全间隔（ms）*/
  backfillIntervalMs: 10 * 60 * 1000,
  /** 每次补全处理数 */
  backfillBatchSize: 50,
  /** 补全锁 TTL（秒） */
  backfillLockTtlSeconds: 300,
} as const;
