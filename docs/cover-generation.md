# 封面生成系统

面向开发者的架构说明。系统为视频自动抽帧、择优、编码多格式封面，并通过 `/api/cover` 统一代理与缩略。

## 整体流程

```
投稿/编辑/审核 ──enqueueCoverForVideo()──► Redis 队列 cover:queue
                                              │
        startCoverWorker() 4 个并发 worker ◄──┘  (BRPOP)
                │  ffmpeg 抽帧 → 质量打分择优 → Sharp 编码 AVIF/WebP/JPEG
                ▼
        写入 uploads/cover/<id>.{avif,webp,jpg} + Video.coverUrl / coverBlurHash
```

- **触发**：内容路由在创建/编辑/审核时调用 `enqueueCoverForVideo()`（`src/lib/cover-auto.ts`）。
- **补全**：`startBackfillScheduler()` 每 10 分钟扫描 `status=PUBLISHED` 且 `coverUrl` 为空的视频补生成。
- **启动**：worker 与补全调度都在 `src/instrumentation.ts` 里启动，**仅生产环境**（非 dev、非 serverless、`NEXT_RUNTIME=nodejs`）。开发环境 `enqueueCoverForVideo()` 直接 no-op。

## 关键文件

| 文件 | 职责 |
| --- | --- |
| `src/lib/cover.ts` | URL 构造：`getCoverUrl()` / `getImageProxyUrl()` / `getThumbnailUrl()` |
| `src/lib/cover-config.ts` | `COVER_CONFIG`（队列名、并发、TTL、尺寸/质量默认值） |
| `src/lib/cover-generator.ts` | ffmpeg 抽帧、帧质量分析、Sharp 编码 |
| `src/lib/cover-queue.ts` | Redis 队列 / 锁 / 重试 / 统计 / 日志 |
| `src/lib/cover-auto.ts` | worker 生命周期、补全调度、`enqueueCoverForVideo()` |
| `src/app/api/cover/[...path]/route.ts` | HTTP 代理、外链缓存、缩略图生成、占位回退 |
| `src/lib/thumbnail-presets.ts` | 缩略图档位预设 |
| `src/server/routers/admin/covers.ts` | 后台：重置/手动生成/上传/统计/日志 |

## 队列与并发（Redis）

- 队列：`COVER_CONFIG.queueName`（`cover:queue`），worker 用 `BRPOP` 阻塞消费。
- 去重锁：`SET cover:lock:<id> 1 EX <lockTtl> NX`，入队失败说明已在处理；TTL 默认 180s（超时会被重新入队）。
- 重试：失败重新 `LPUSH`，计数存 `cover:retry:<id>`；累计失败达上限进入 `cover:failed`。
- 补全：抢 `cover:backfill:lock`（TTL 300s），单批 50 条。
- 并发：`COVER_CONFIG.maxConcurrency`（默认 4）。

## 抽帧与编码（Sharp）

1. ffprobe 取时长（5s 超时回退固定采样点），按时长动态计算采样点，逐帧提取（ffmpeg 15s 超时，HLS 提至 45s）。
2. 在 480px 缩图上打分：亮度 0.3 + 对比度 0.25 + 锐度 0.25 + 饱和度 0.2；排除过暗/过亮帧；得分 ≥0.8 早停。
3. 并行编码三格式：AVIF（quality 65）/ WebP（82）/ JPEG（88, mozjpeg）；按 AVIF > WebP > JPEG 取首个成功格式。
4. 生成 32×18 模糊 JPEG 作为 `coverBlurHash`（base64 占位图）。

> 编码参数优先取 DB `SiteConfig`（`coverWidth` / `coverAvifQuality` / `coverWebpQuality` / `coverJpegQuality` / `coverProxyThumbEnabled` / `thumbnailPresets`），回退 `COVER_CONFIG` 默认值。

## 存储与访问

- 落地：`<UPLOAD_DIR>/cover/<videoId>.{avif,webp,jpg}`，`Video.coverUrl` 存相对路径，`Video.coverBlurHash` 存占位图。
- 访问：
  - `/api/cover/video/<videoId>` —— 有本地文件直接返回；否则尝试外链缓存 / CDN 缩略图回退；都失败返回 202 + 占位 GIF 并触发入队。
  - `/api/cover/<encodeURIComponent(外链)>` —— 远链代理并缓存到 `public/cache/covers/`。
  - 加 `?w=&h=&q=` 生成 WebP 缩略（受 `coverProxyThumbEnabled` 控制；w/h 限 16–1200、q 限 1–100）。
- 前端用 `getCoverUrl()` 决定走本地路径还是代理 URL。

## 环境变量

- `NEXT_PUBLIC_APP_URL`（构造完整 URL）、`UPLOAD_DIR`（默认 `./uploads`）。
- `NODE_ENV=development` 跳过生成；serverless（`VERCEL`/`NETLIFY`/`AWS_LAMBDA_*`）不启动 worker。

## 注意点 / 陷阱

- 开发环境不生成封面（设计如此）；本地调试封面要模拟生产或用脚本。
- 生成缓存（`uploads/cover/`）与代理缓存（`public/cache/covers/`）是两个不同目录。
- 改了编码参数但不清旧文件，旧请求会命中旧质量缓存。
- 锁 TTL 仅 180s，单视频生成超时会被重复入队。
- CDN 缩略图回退返回 202 但不写库，等队列真正生成后才更新 `coverUrl`。

## 如何扩展

- **新增缩略档位**：在 `thumbnail-presets.ts` 加 `THUMBNAIL_PRESET_NAMES` + `DEFAULT_THUMBNAIL_PRESETS` + meta；`SiteConfig.thumbnailPresets` JSON 自动兼容。
- **新增编码格式**：改 `cover-config.ts` 的 `formats`，在 `cover-generator.ts` 的编码分支加 case，在 route 的格式协商里加项。
- **新增触发点**：在对应路由调用 `enqueueCoverForVideo()`。
- **改并发/采样/权重**：分别改 `COVER_CONFIG.maxConcurrency`、`cover-generator.ts` 的采样函数、打分权重。

脚本：`scripts/generate-covers.ts` 支持批量/断点续传生成。
