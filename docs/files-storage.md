# 文件与云存储

面向开发者的架构说明，覆盖文件上传/秒传、存储后端（S3 / 本地）、云盘导入与 SSRF 防护。

## 上传流程

- 入口：`file.*` tRPC 路由（`src/server/routers/file.ts`）+ 存储编排 `src/lib/storage-policy.ts`。
- **直传 vs 分片**：S3 后端，单文件 ≤10MB（`MULTIPART_THRESHOLD`）走单个 presigned PUT，>10MB 走 S3 multipart（分片 10MB）；本地后端始终分片（`POST /api/files/upload-chunk?fileId=&index=`，临时存 `.chunks/<fileId>/<index>`，完成合并）。
- **秒传去重**：`file.checkHash()` 用 SHA-256（`src/lib/file-hash.ts`，hash-wasm 流式 2MB 分块算）查是否已有 `hash+size+status=UPLOADED` 的 `UserFile`；命中则新建记录**指向同一 `storageKey`**，不复制物理文件。
- **状态机**：`UserFile.status` = `UPLOADING` → `UPLOADED` → `FAILED` / `DELETED`。
- **配额**：`User.storageUsed` 计量，删除时仅当无其他 `UserFile` 引用同一 `storageKey` 才删物理文件并回退配额。

## 存储后端

- **S3 兼容**（`src/lib/s3-client.ts`）：支持 AWS S3 / R2 / MinIO / OSS / COS；MinIO 自动 `forcePathStyle`；支持 `pathPrefix` 与 `customDomain`（presigned URL 替换 host）。
- **本地**：`<uploadDir>/user-files/<userId>/<category>/<uuid>.<ext>`，经 `/api/files/serve/<storageKey>` 代理访问。
- **存储策略**（`StoragePolicy`）：`{ provider, endpoint, bucket, region, accessKey, secretKey, customDomain, pathPrefix, uploadDir, maxFileSize, allowedTypes[], isDefault, enabled }`。`resolvePolicy()` 按 `SiteConfig.fileStorageRouteRules` 依 MIME 匹配选择策略。

## 云盘导入（ImportTask）

支持 provider：`google` / `onedrive` / `dropbox` / `url`（`src/lib/cloud-providers/`）。

- **OAuth 授权**（`google` / `onedrive`）：`import.getOAuthUrl()` 生成链接 → 后端存 CSRF nonce 到 Redis `cloud:oauth_nonce:<nonce>`（TTL 600s）→ 弹窗跳转 → 回调 `src/app/api/cloud-auth/[provider]/callback/route.ts` 校验并回收 nonce → 换 token 存 Redis `cloud:token:<userId>:<provider>`（TTL 3600s，**不自动续期**）。
- **导入**：建 `ImportTask`（`PENDING`）→ `enqueueImport(taskId)` 入 Redis `import:queue` → worker（`MAX_CONCURRENT=2`）取 provider 下载流 → `streamToStorage()` 流式写入（每 500ms 更新 `progress`/`downloadedBytes`，并检查取消）→ 完成建 `UserFile`、更新配额。
- 状态：`PENDING` → `DOWNLOADING` → `PROCESSING` → `COMPLETED` / `FAILED` / `CANCELLED`；用户同时最多 5 个活跃任务。
- provider 特例：Google Drive 公开大文件需解析确认 token；OneDrive 走 Graph shares endpoint；Dropbox `dl=0`→`dl=1`。

## SSRF 防护

`src/lib/cloud-providers/ssrf-guard.ts`：`isUrlSafe()` 拦截内网/保留地址（10/8、172.16/12、192.168/16、127/8、169.254/16 云元数据、IPv6 link-local/ULA、`localhost`/`*.internal`/`metadata.google.internal`）；`safeFetch()` 手动处理重定向，每跳校验 Location，最多 10 跳。`import.createTask()` 与 url-download 均做校验（深度防护）。

## tRPC 路由

- **file**：`checkHash` / `initUpload` / `getUploadProgress` / `getResumeUrls` / `completeUpload` / `list` / `getByContent` / `attach` / `detach` / `delete` / `getStorageUsage`。
- **import**：`createTask` / `parseUrl` / `listTasks` / `cancelTask` / `getOAuthUrl` / `hasToken`。
- **管理端**：`admin.files.*`（listFiles / deleteFile / forceDetach / getFileUserStats / cleanStale / updateUserQuota）、`admin.storagePolicies.*`（CRUD）。

## 配置

- 存储凭证、OAuth client id/secret、`uploadDir`（默认 `./uploads`）均存 `SiteConfig`（无专用 env）。
- 基础 env：`DATABASE_URL` / `REDIS_URL` / `BETTER_AUTH_*` / `NEXT_PUBLIC_APP_URL`（OAuth 回调）。

## 注意点 / 陷阱

- 删除 `StoragePolicy` 前需确认没有非 `DELETED` 文件仍在使用，否则会留下孤儿文件。
- S3 multipart 的 `s3UploadId` / `totalChunks` 持久化在 `UserFile`，URL 过期可 `getResumeUrls()` 续传已传分片。
- 云盘 OAuth token TTL 仅 1 小时且不自动刷新，过期需重新授权。
- 秒传的 hash 检查与配额校验之间存在并发竞态，极端情况可能超额（建议加 DB 约束）。
- 本地分片 `.chunks/` 若进程异常会留垃圾，依赖 `admin.files.cleanStale()` 清理。

## 如何扩展

- **新增云盘 provider**：在 `cloud-providers/<x>.ts` 实现 `CloudProvider`（`parseShareUrl` / `downloadStream`），在 `index.ts` 的 `getProvider()` 注册，在 `import.ts` 的 `CLOUD_PROVIDERS` 加项；需 OAuth 则补 `getOAuthUrl()` case 与回调 token 交换。
- **新增存储后端**：多数 S3 兼容可直接用 `StoragePolicy` 配置；非 S3 协议需扩展 `s3-client.ts` 与连通性测试。
