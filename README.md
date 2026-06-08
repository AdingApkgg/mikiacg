# ACGN Platform

ACGN 流式媒体内容分享平台。不存储视频文件，仅通过用户提供的直链（MP4 / HLS）加载视频，同时提供游戏资源、图片投稿分享，以及社区、通讯、积分、支付等完整能力。

## 功能特性

**视频**
- 直链投稿（MP4 / M3U8 / WebM），支持分 P、合集 / 剧集
- HLS 自适应码率播放（hls.js）
- 收藏、点赞 / 踩 / 困惑，观看历史，自定义播放列表
- 标签分类、关联视频、相对发布时间
- 自动封面生成（Sharp，带队列）

**游戏**
- 游戏资源投稿，支持多平台下载链接与多版本（GameVersion）
- 分类（ADV / SLG / RPG / ACT 等）、别名（GameAlias）、自定义标签页（GameCustomTab）
- 收藏、点赞 / 踩，游戏截图展示、游戏内置视频播放

**图片**
- 图片投稿，标签分类
- 收藏、点赞 / 踩、观看历史
- 图片查看器（大图浏览）、图片评论

**搜索**
- Meilisearch 全文搜索（视频 / 游戏 / 图片 / 用户 / 标签）
- 搜索建议、热门 / 推荐发现页
- 内容创建 / 审核 / 编辑时自动增量同步索引

**社区**
- 注册 / 登录用户 + 匿名访客评论（视频 & 游戏 & 图片）
- Tiptap 富文本评论（提及 @、贴图、短代码），回复、表情反应、置顶、软删除
- 邮箱验证码登录 / 注册、密码重置
- 两步验证（2FA / Passkey）、Telegram 登录
- 多账号切换（重新鉴权）、登录会话管理
- 留言板（Guestbook）、排行榜、全站统计

**通讯系统**
- 站内通知（评论回复、点赞、收藏、关注、审核状态、工单更新、系统公告），实时推送 + 通知铃铛
- 关注系统（关注 / 取关、粉丝 / 关注列表、关注数统计）
- 私信（1 对 1 会话、消息历史、未读计数）
- 聊天频道（公开 / 私有频道、成员管理与角色、引用回复）
- 输入指示器、已读回执、在线状态
- 聊天中发送图片 / 文件、表情包 & 贴图选择器
- Socket.io 实时双向通信，Redis Pub/Sub 多实例扩展

**贴图 & 表情**
- 贴图包管理（创建 / 上传 / 分类）
- 评论和聊天中嵌入贴图
- 内置 Emoji 选择器

**文件 & 云存储**
- 用户文件管理（`/my-files`），秒传（文件哈希去重）
- S3 兼容对象存储 + 云盘导入（Google Drive / OneDrive / Dropbox，OAuth 授权）
- URL 直链导入（带 SSRF 防护），导入任务队列
- 后台存储策略（StoragePolicy）配置

**推荐 & 积分 & 支付**
- 推荐链接系统（生成 / 追踪点击 / 每日统计 / 推荐记录）
- 积分系统（积分事务记录）
- 兑换码（生成 / 批量 / 兑换）
- USDT / TRC-20 支付（支付套餐、订单管理、Tron 链上监控）

**开放平台**
- API Key 管理（细粒度 scope），用户「开发者」设置页
- OpenAPI 端点 + 在线 API 文档（`/api-docs`）

**工单 & 反馈**
- 工单反馈系统（分类 / 优先级 / 状态）、回复、自动关闭
- 批量处理、合并、CSV 导出、邮件通知

**管理后台**（`/dashboard`）
- 视频 & 游戏 & 图片审核（待审 / 通过 / 驳回）
- 用户管理（封禁 / 权限 / 投稿资格）、用户组（UserGroup）
- 评论管理、标签管理（分类 / 别名 / 蕴含）、友情链接管理
- 合集管理、封面管理、贴图包管理
- 文件管理、存储策略管理
- 推荐系统管理、积分管理、支付 & 套餐管理
- 榜单管理、数据洞察分析、工单管理
- 数据库备份管理
- 站点配置（公告、功能开关、SEO、广告系统）
- 细粒度管理员权限范围（`adminScopes`）

**其他**
- PWA 支持（Serwist Service Worker，离线缓存静态资源）
- MDX 富文本内容（静态页 / 描述）+ Tiptap 富文本编辑器
- 广告系统 & 广告门（可配置点击次数 / 免广告时长 / 信息流广告 / 定向 / 排期）
- IndexNow + Google Search Console 主动推送
- SEO 全套（Sitemap / RSS / robots.txt / JSON-LD / Open Graph）
- AI/LLM 友好端点（llms.txt / ai-plugin.json / OpenAPI）
- IP 属地显示（ip2region.js）、设备指纹追踪、观看防刷
- 深色 / 浅色主题切换、音效反馈、动效偏好（减弱动画）
- 键盘快捷键 & 命令面板
- Telegram Mini App（TMA）适配 + 自动登录
- Tauri 桌面 / Android 客户端（mikiacg / aiacg 双配置）
- 初始化向导（`/setup`）
- 法律页面（关于、隐私政策、服务条款）

## 技术栈

| 层级         | 技术                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| **框架**     | Next.js 16（App Router, Turbopack, `output: standalone`）+ React 19 + TypeScript 6 |
| **样式**     | Tailwind CSS v4 + shadcn/ui（new-york）+ Framer Motion 12                      |
| **状态**     | Zustand 5 + TanStack Query 5 + React Context                                  |
| **API**      | tRPC v11 + Zod v4 + superjson                                                 |
| **认证**     | Better Auth 1.6（JWT 策略，邮箱验证码，2FA / Passkey，Telegram 登录，多账号切换） |
| **数据库**   | PostgreSQL 18 + Prisma 7（`@prisma/adapter-pg`，客户端输出到 `src/generated/prisma`） |
| **缓存**     | Redis 8 + ioredis                                                            |
| **搜索**     | Meilisearch（全文搜索 + 推荐发现）                                            |
| **实时通信** | Socket.io 4 + @socket.io/redis-adapter（独立进程，Redis Pub/Sub 扩展）        |
| **对象存储** | S3 兼容（@aws-sdk/client-s3）+ 云盘（Google Drive / OneDrive / Dropbox）      |
| **播放器**   | react-player + hls.js                                                        |
| **富文本**   | Tiptap 3（编辑器）+ react-markdown + MDX（@next/mdx + next-mdx-remote）        |
| **3D**       | Three.js + React Three Fiber（登陆页动效）                                    |
| **PWA**      | Serwist（Service Worker + 运行时缓存）                                        |
| **图像**     | Sharp（封面生成 & 处理）                                                      |
| **邮件**     | Nodemailer（SMTP）                                                            |
| **支付**     | USDT TRC-20（tron-monitor）                                                   |
| **测试**     | Vitest 4                                                                     |
| **客户端**   | Tauri 2（桌面 / Android）                                                     |
| **工具链**   | pnpm 10 + Biome 2（格式化）+ ESLint 9（lint）                                  |
| **部署**     | Podman / Docker Compose / PM2 / systemd / deploy.sh                          |

## 开始开发

### 1. 安装依赖

```bash
pnpm install
pnpm approve-builds  # 批准依赖的构建脚本（sharp, prisma 等）
```

### 2. 配置环境变量

```bash
cp .env.development.example .env.development
```

应用**必须**的环境变量只有四组：数据库、Redis、Meilisearch、Better Auth。其余配置（SMTP、上传目录、搜索引擎推送、站点信息等）均可在后台「系统设置」中管理。

| 变量                     | 说明                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL 连接串                                                   |
| `REDIS_URL`              | Redis 连接串                                                        |
| `MEILISEARCH_URL`        | Meilisearch 地址（本地 `http://127.0.0.1:7700`）                    |
| `MEILISEARCH_MASTER_KEY` | Meilisearch API 密钥（与 `MEILI_MASTER_KEY` 在 Compose 中保持一致） |
| `BETTER_AUTH_SECRET`     | Auth 密钥（`openssl rand -base64 32`）                              |
| `BETTER_AUTH_BASE_URL`   | 站点地址（开发环境 `http://localhost:3000`，后台设置优先级更高）    |
| `NEXT_PUBLIC_APP_URL`    | 前端访问地址（开发环境 `http://localhost:3000`）                    |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io 地址（开发环境 `http://localhost:3001`）                  |

首次启动时会自动进入初始化向导（`/setup`），引导创建管理员账户和基本站点设置。

### 3. 启动基础服务

**方式 A：Docker / Podman Compose（推荐）**

```bash
pnpm compose:infra   # 启动 PostgreSQL 18 + Redis 8 + Meilisearch 容器
```

`pnpm compose:infra` 会通过 `scripts/compose.sh` 自动选择可用的 `docker compose`、`docker-compose` 或 `podman compose`，并读取 `.env.development`。也可以显式使用：

```bash
pnpm compose:infra:docker
pnpm compose:infra:podman
```

默认连接地址（`.env.development`）：

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/acgn?schema=public"
REDIS_URL="redis://localhost:6379"
MEILISEARCH_URL="http://127.0.0.1:7700"
MEILISEARCH_MASTER_KEY="dev-meili-master-key-change-me"
MEILI_MASTER_KEY="dev-meili-master-key-change-me"
```

`compose.yaml` 默认把容器端口绑定到宿主机 **loopback**（`127.0.0.1`）：PostgreSQL `5432`、Redis `6379`、Meilisearch `7700`，只在本机可访问，不对外暴露。

- 如需改端口，在 `.env.development` 中设置 `POSTGRES_PORT`、`REDIS_PORT`、`MEILISEARCH_PORT`，并同步修改对应连接 URL。
- 如需对外暴露（例如其他机器访问），设成 `POSTGRES_PORT="0.0.0.0:5432"` 等显式覆盖默认 loopback 绑定。

数据会持久化在 Compose named volumes：`postgres_data`、`redis_data`、`meilisearch_data`。`pnpm compose:down` 只停止并移除容器，不会删除这些 volumes。不要执行 `docker compose down -v`、`podman compose down -v` 或其他删除 volume 的命令，否则本地数据库和索引数据会丢失。

确认基础服务可连接：

```bash
pnpm compose:ps
bash scripts/compose.sh --env-file .env.development exec postgres pg_isready -U postgres -d acgn
bash scripts/compose.sh --env-file .env.development exec redis redis-cli ping
curl http://127.0.0.1:7700/health
```

**方式 B：本地安装**

自行安装 PostgreSQL、Redis 与 Meilisearch，在 `.env.development` 中修改连接地址。

### 3.1 容器全栈启动

`pnpm compose:up` 是生产式容器全栈启动：PostgreSQL、Redis、Meilisearch、Next.js、Socket.io 都在容器中运行。它会读取 `.env.production`，并且 `compose.yaml` 中的 `app` / `socket` 服务仍通过 `env_file: .env.production` 加载生产配置。

宿主机开发推荐使用 `pnpm compose:infra` 加 `pnpm dev`。不要把 `pnpm compose:up` 当作热更新开发服务器使用。

### 4. 初始化数据库

```bash
pnpm db:generate   # 生成 Prisma Client
pnpm db:push       # 推送数据库 schema
pnpm db:seed       # (可选) 填充初始数据
```

### 4.1 初始化搜索索引（Meilisearch）

```bash
pnpm meili:init     # 创建索引与 settings
pnpm meili:reindex  # 全量同步文档（首次或兜底）
```

### 5. 启动开发服务器

```bash
pnpm dev   # 同时启动 Next.js (端口 3000) 和 Socket.io (端口 3001)
```

也可单独启动：

```bash
pnpm dev:next     # 仅 Next.js (Turbopack, 端口 3000)
pnpm dev:socket   # 仅 Socket.io 服务器 (端口 3001)
```

访问 http://localhost:3000

如果本地 shell 找不到 `pnpm`，可用 `corepack pnpm` 替代，例如 `corepack pnpm dev`。

### 6. 初始化站点 & 创建站长

```bash
# 访问 /setup 进行初始化向导，或手动创建：
pnpm script:create-owner   # 创建 OWNER 角色用户
```

## 可用脚本

### 开发 & 构建

| 命令              | 说明                                                         |
| ----------------- | ------------------------------------------------------------ |
| `pnpm dev`        | 启动开发服务器（Next.js 端口 3000 + Socket.io 端口 3001）    |
| `pnpm dev:next`   | 仅启动 Next.js（Turbopack, 端口 3000）                       |
| `pnpm dev:socket` | 仅启动 Socket.io 服务器（端口 3001）                         |
| `pnpm build`      | 构建生产版本（Prisma Generate → Next Build → Serwist Build） |
| `pnpm start`      | 启动生产服务器                                               |
| `pnpm lint`       | 运行 ESLint                                                  |
| `pnpm typecheck`  | TypeScript 类型检查（`tsc --noEmit`）                        |
| `pnpm check`      | ESLint + TypeScript 类型检查                                 |
| `pnpm test`       | 运行 Vitest 测试（`test:watch` / `test:coverage` 可选）      |

> 格式化由 Biome 负责：`pnpm biome check .`（或 `pnpm biome format .`）。

### 数据库 & 搜索

| 命令                      | 说明                                       |
| ------------------------- | ------------------------------------------ |
| `pnpm db:generate`        | 生成 Prisma Client                         |
| `pnpm db:push`            | 推送 schema 到数据库                       |
| `pnpm db:migrate`         | 运行数据库迁移（`prisma migrate dev`）     |
| `pnpm db:studio`          | 打开 Prisma Studio                         |
| `pnpm db:seed`            | 填充初始数据                               |
| `pnpm meili:init`         | 创建 Meilisearch 索引与 settings           |
| `pnpm meili:reindex`      | 全量同步文档到 Meilisearch（开发环境）     |
| `pnpm meili:reindex:prod` | 全量同步文档到 Meilisearch（生产环境）     |

### Docker / Podman Compose

| 命令                     | 说明                                                 |
| ------------------------ | ---------------------------------------------------- |
| `pnpm compose:infra`     | 启动 PostgreSQL + Redis + Meilisearch 容器（开发用） |
| `pnpm compose:up`        | 生产式容器全栈启动，需 `.env.production`             |
| `pnpm compose:down`      | 停止开发基础服务对应的 Compose 容器                  |
| `pnpm compose:logs`      | 查看开发基础服务对应的 Compose 日志                  |
| `pnpm compose:build`     | 使用 `.env.production` 重新构建生产式容器镜像        |
| `pnpm compose:ps`        | 查看 Compose 服务状态                                |
| `pnpm compose:prod:down` | 停止生产式容器全栈                                   |
| `pnpm compose:prod:logs` | 查看生产式容器全栈日志                               |

`pnpm compose:down` 不会删除 named volumes。不要使用 `compose down -v`，否则 `postgres_data`、`redis_data`、`meilisearch_data` 中的本地数据会被删除。

### PM2 / systemd

| 命令                 | 说明                                  |
| -------------------- | ------------------------------------- |
| `pnpm pm2:start`     | 启动 PM2 进程（Next.js + Socket.io）  |
| `pnpm pm2:stop`      | 停止 PM2 进程                         |
| `pnpm pm2:restart`   | 重启 PM2 进程                         |
| `pnpm pm2:logs`      | 查看 PM2 日志                         |
| `pnpm pm2:status`    | 查看 PM2 状态                         |
| `pnpm systemd:install` | 安装 systemd 服务单元                |
| `pnpm systemd:start` / `stop` / `restart` | 控制 `moestream.target`  |
| `pnpm systemd:status` / `logs`            | 查看 systemd 服务状态 / 日志 |

### 桌面 / Android 客户端（Tauri）

| 命令                          | 说明                                  |
| ----------------------------- | ------------------------------------- |
| `pnpm tauri:dev`              | 启动 Tauri 开发                       |
| `pnpm tauri:build:mikiacg`    | 构建 mikiacg 配置客户端               |
| `pnpm tauri:build:aiacg`      | 构建 aiacg 配置客户端                 |
| `pnpm tauri:build:all`        | 构建全部客户端配置                    |

### 运维脚本

| 命令                       | 说明                       |
| -------------------------- | -------------------------- |
| `pnpm script:create-user`  | 创建用户                   |
| `pnpm script:create-owner` | 创建站长账号（OWNER 角色） |
| `pnpm script:migrate-auth` | Better Auth 数据迁移       |
| `pnpm script:fetch-videos` | 导入旧站视频数据           |
| `pnpm script:fetch-games`  | 导入旧站游戏数据           |

`scripts/` 目录下还包含更多维护脚本：`reindex-meilisearch.ts`（重建搜索索引）、`fetch-legacy-images.ts`（导入旧站图片）、`merge-duplicate-videos.ts` / `merge-duplicate-tags.ts`（合并重复视频 / 标签）、`migrate-user-ids.ts` / `migrate-video-ids.ts` / `randomize-video-ids.ts`（ID 迁移与随机化）、`migrate-can-upload.ts` / `migrate-published-at.ts`（字段迁移）、`generate-covers.ts`（批量生成封面）、`seed-demo-data.ts`（演示数据）、`list-users.ts` / `check-data.ts`（巡检）、`build-android.sh`（Android 构建）。

## 生产部署

### 方式 A：Podman Compose Rootless（推荐）

支持 rootless Podman，无需 root 权限，安全性更高。

```bash
git clone https://github.com/AdingApkgg/moe-stream.git
cd moe-stream
cp .env.production.example .env.production
# 编辑 .env.production

# 全栈启动（PostgreSQL + Redis + Meilisearch + Next.js + Socket.io）
podman compose up -d

# 初始化数据库
podman compose exec app npx prisma db push
```

容器使用多阶段构建（Node 24 Alpine + pnpm），非 root 用户运行。Next.js 和 Socket.io 作为独立容器分别管理。

### 方式 B：PM2

```bash
git clone https://github.com/AdingApkgg/moe-stream.git
cd moe-stream
cp .env.example .env
# 编辑 .env

pnpm install --frozen-lockfile
pnpm db:generate && pnpm db:push && pnpm build

# 启动 Next.js + Socket.io
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

### 方式 C：systemd

```bash
pnpm systemd:install   # 安装 moestream-app / moestream-socket 服务单元
pnpm systemd:start     # 启动 moestream.target
pnpm systemd:status    # 查看状态
```

### 方式 D：deploy.sh 脚本（本地 → 远程）

本地打包源代码（~3MB），传输到服务器后构建。

```bash
# 配置 .env.deploy（DEPLOY_USER / DEPLOY_HOST / DEPLOY_PATH）
pnpm deploy              # 常规部署（PM2）
pnpm deploy -- --full    # 完整部署（含 data/ 目录，首次需要）
pnpm deploy:systemd      # 部署并使用 systemd 管理
```

### 从 GitHub 拉取更新

**Podman Compose:**

```bash
git pull origin main
podman compose build
podman compose run --rm app npx prisma db push
podman compose up -d
podman image prune -f   # 清理旧镜像
```

**PM2:**

```bash
git pull origin main
pnpm install --frozen-lockfile
pnpm db:generate && pnpm db:push && pnpm build
pm2 restart ecosystem.config.cjs
```

更多部署细节（Rootless Podman 配置、Nginx 反代、Rathole 内网穿透、SSL、备份）参见 [deploy/README.md](deploy/README.md)。

## 项目结构

```
moe-stream/
├── prisma/
│   ├── schema.prisma        # 数据模型定义
│   ├── seed.ts              # 种子数据
│   └── sql/                 # 原始 SQL（pg_trgm 索引等，已弃用）
├── scripts/                 # 运维 & 迁移脚本（含 reindex-meilisearch / compose.sh / build-android）
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (auth)/          # 认证页面 (登录/注册/找回密码/2FA)
│   │   ├── dashboard/       # 管理后台
│   │   │   ├── videos/ games/ images/   # 内容审核与管理
│   │   │   ├── tags/ comments/ users/   # 标签/评论/用户
│   │   │   ├── groups/      #   用户组
│   │   │   ├── series/ covers/ stickers/  # 合集/封面/贴图包
│   │   │   ├── files/ storage/  # 文件管理/存储策略
│   │   │   ├── links/       #   友情链接
│   │   │   ├── referral-admin/ points/ payment/  # 推荐/积分/支付
│   │   │   ├── rankings/    #   榜单管理
│   │   │   ├── tickets/     #   工单管理
│   │   │   ├── stats/       #   数据洞察分析
│   │   │   ├── backups/     #   备份管理
│   │   │   └── settings/    #   站点设置
│   │   ├── settings/        # 用户设置 (account/sessions/preferences/developer/danger)
│   │   ├── notifications/   # 通知中心
│   │   ├── messages/        # 私信 (双栏: 会话列表 + 消息线程)
│   │   ├── channels/[slug]/ # 聊天频道
│   │   ├── video/ game/ image/  # 内容详情 & 编辑
│   │   ├── series/          # 合集详情
│   │   ├── search/          # 搜索
│   │   ├── upload/          # 投稿
│   │   ├── profile/ user/[id]/  # 个人资料 / 用户主页
│   │   ├── tag/[slug]/ tags/    # 标签页 / 标签列表
│   │   ├── ranking/ (rankings → ranking)  # 排行榜 (三栏 Tab)
│   │   ├── stats/           # 全站统计
│   │   ├── my-works/ my-series/ my-files/  # 我的作品/合集/文件
│   │   ├── favorites/ history/ comments/   # 收藏/历史/我的评论
│   │   ├── feedback/        # 工单反馈
│   │   ├── links/           # 友情链接页
│   │   ├── promotion/       # 推广 / 活动页
│   │   ├── setup/           # 初始化向导
│   │   ├── r/[code]/ redirect/  # 推荐链接跳转 / 外链中转
│   │   ├── api-docs/        # 在线 API 文档
│   │   ├── about/ terms/ privacy/  # 法律页面
│   │   ├── api/             # API 路由
│   │   │   ├── trpc/        #   tRPC handler
│   │   │   ├── auth/        #   Better Auth + session-info + link/telegram
│   │   │   ├── cloud-auth/[provider]/  # 云盘 OAuth 回调
│   │   │   ├── upload/ files/  # 文件上传/访问
│   │   │   ├── cover/       #   封面代理/缓存
│   │   │   ├── email/ captcha/  # 邮件验证码 / 验证码
│   │   │   └── indexnow/    #   搜索引擎推送
│   │   ├── uploads/         # 上传文件代理路由
│   │   ├── sitemap/ sitemap.ts  # 站点地图 (视频/游戏/图片/用户/标签/静态页)
│   │   ├── feed.xml/ rss/   # RSS
│   │   ├── llms.txt/ llms-full.txt/ llms/  # LLM 端点
│   │   ├── .well-known/     # ai-plugin.json / openapi.yaml / security.txt
│   │   ├── manifest.ts robots.ts opengraph-image.tsx  # PWA / SEO 约定文件
│   │   └── sw.ts            # Service Worker
│   ├── components/
│   │   ├── layout/          # 布局 (Header/Footer/Sidebar/底部导航/命令面板/TMA 桥接)
│   │   ├── ui/              # shadcn/ui 基础组件 (~50)
│   │   ├── video/ game/ image/  # 内容组件 (卡片/网格/播放器/封面/表单)
│   │   ├── composite/       # 首页 / 分区聚合组件 (Hero/混合热门/周榜/NSFW 开关)
│   │   ├── comment/         # 评论组件
│   │   ├── editor/          # Tiptap 富文本编辑器 (评论/投稿，含提及/短代码/斜杠菜单)
│   │   ├── notifications/   # 通知组件 (铃铛/列表/详情)
│   │   ├── messages/        # 私信组件 (会话列表/消息线程/输入框)
│   │   ├── files/           # 文件组件 (上传/卡片/附件面板/导入对话框)
│   │   ├── search/          # 搜索发现组件
│   │   ├── shared/          # 通讯共享组件 (输入指示器/在线状态/贴图选择器/文件上传)
│   │   ├── admin/           # 管理组件 (权限转移/封面面板/合集面板)
│   │   ├── effects/         # 视觉特效 (3D 登陆场景/粒子背景)
│   │   ├── ads/             # 广告组件 (广告门/广告位/信息流广告)
│   │   ├── dialogs/         # 全局对话框 (APP 下载弹窗等)
│   │   ├── mdx/             # MDX 渲染器
│   │   ├── seo/             # SEO (JSON-LD)
│   │   ├── stats/ motion/ auth/  # 统计 / 动画 / 社交登录
│   │   ├── socket-provider.tsx   # Socket.io 连接管理
│   │   ├── tma-*.tsx        # Telegram Mini App 引导 / 自动登录
│   │   └── providers.tsx         # 全局 Providers
│   ├── lib/                 # 工具库（详见下方说明）
│   ├── socket/              # Socket.io 服务端
│   │   ├── server.ts        #   入口（HTTP + Socket.io + Redis adapter）
│   │   ├── auth.ts          #   连接认证中间件（Better Auth 会话验证）
│   │   └── handlers/        #   事件处理器 (notification/message/channel/presence)
│   ├── server/              # 服务端
│   │   ├── trpc.ts          #   tRPC 上下文 & 过程定义
│   │   └── routers/         #   tRPC 路由（见下）
│   ├── hooks/               # React Hooks (~24)
│   ├── stores/              # Zustand 状态 (app/user/socket)
│   └── generated/           # Prisma 生成代码 (gitignore)
├── deploy/                  # 部署配置 (Nginx/Rathole/systemd 模板 + README)
├── systemd/                 # systemd 服务单元与安装脚本
├── src-tauri/               # Tauri 桌面 / Android 客户端 (configs/ 多站点配置)
├── uploads/                 # 上传文件目录
├── compose.yaml             # Podman / Docker Compose (rootless 兼容)
├── Dockerfile               # 多阶段构建 (Next.js + Socket.io 双 target)
├── ecosystem.config.cjs     # PM2 配置 (Next.js + Socket.io 双进程)
├── serwist.config.js        # PWA Service Worker 配置
├── deploy.sh                # 一键部署脚本
└── mdx-components.tsx       # Next.js MDX 约定文件
```

### tRPC 路由

根路由在 `src/server/routers/_app.ts`，聚合以下子路由：

```
user        video        game        image       tag
comment     gameComment  imagePostComment         series
sticker     referral     redeem      payment      notification
follow      message      channel     guestbook    file
import      apiKey       openApi     search       playlist
ad          ranking      ticket      site         setup
admin       # 管理后台，由 admin/ 子目录通过 mergeRouters 合并
```

`admin/` 子目录：`stats`、`users`、`videos`、`tags`、`comments`、`config`、`covers`、`games`、`images`、`export`、`links`、`backups`、`series`、`stickers`、`files`、`storage-policies`、`groups`、`ads`、`ranking`、`tickets`。

### lib 工具库（`src/lib/`）

按领域分组：

- **认证**：`auth.ts`、`auth-client.ts`、`auth-telegram-plugin.ts`、`telegram.ts`、`telegram-auth.ts`
- **数据 / 缓存**：`prisma.ts`、`redis.ts`、`memory-cache.ts`
- **API / 权限**：`trpc.ts`、`api-scopes.ts`、`permissions.ts`、`group-permissions.ts`
- **搜索**：`meilisearch.ts`、`meili-filters.ts`、`search-index-config.ts`、`search-recommend.ts`、`search-sync.ts`、`search-text.ts`
- **内容 / 发布**：`publication.ts`、`series-types.ts`、`tag-counts.ts`、`schemas/`
- **封面 / 图像**：`cover.ts`、`cover-auto.ts`、`cover-config.ts`、`cover-generator.ts`、`cover-queue.ts`、`avatar.ts`、`thumbnail-presets.ts`、`image-compress-config.ts`
- **文件 / 存储**：`s3-client.ts`、`storage-policy.ts`、`cloud-providers/`（google-drive / onedrive / dropbox / url-download / ssrf-guard）、`file-hash.ts`、`import-queue.ts`
- **通知 / 通讯**：`notification.ts`、`socket-client.ts`、`socket-emitter.ts`
- **排行**：`ranking/`（compute / score / cache / scheduler / types）
- **工单**：`ticket-email.ts`、`ticket-scheduler.ts`、`ticket-schema.ts`
- **支付 / 积分**：`usdt-payment.ts`、`tron-monitor.ts`、`points.ts`
- **SEO / 推送**：`indexnow.ts`、`google-indexing.ts`
- **站点 / 广告 / 初始化**：`site-config.ts`、`server-config.ts`、`ads.ts`、`setup.ts`
- **设备 / 防刷**：`device-info.ts`、`ip-location.ts`、`view-dedup.ts`、`captcha.ts`
- **富文本 / 贴图**：`shortcode-parser.ts`、`sticker-presets.ts`
- **邮件 / 主题 / 音效 / 通用**：`email.ts`、`theme-styles.ts`、`audio.ts`、`toast-with-sound.ts`、`format.ts`、`constants.ts`、`utils.ts`、`hooks.ts`、`bcrypt-wasm.ts`、`wasm-hash.ts`

## 数据模型

Prisma schema（`prisma/schema.prisma`）约 90 个模型 / 枚举。核心关系：

```
User ──┬── Video ──┬── Tag (多对多 TagOnVideo)
       │           ├── Series / SeriesEpisode
       │           ├── Comment ── CommentReaction (支持匿名 + 嵌套回复)
       │           ├── Like / Dislike / Confused / Favorite
       │           ├── WatchHistory
       │           └── Playlist / PlaylistItem
       │
       ├── Game ───┬── Tag (多对多 TagOnGame)
       │           ├── GameAlias / GameVersion / GameCustomTab
       │           ├── GameComment ── GameCommentReaction
       │           └── GameLike / GameDislike / GameFavorite / GameViewHistory
       │
       ├── ImagePost ─┬── Tag (多对多 TagOnImagePost)
       │              ├── ImagePostComment ── ImagePostCommentReaction
       │              └── ImagePostLike / Dislike / Favorite / ViewHistory
       │
       ├── Follow (关注者 ↔ 被关注者，自引用多对多)
       ├── Notification (站内通知，多类型 + JSON 扩展数据)
       │
       ├── Conversation ── ConversationParticipant / DirectMessage (私信)
       ├── Channel ── ChannelMember (OWNER/ADMIN/MEMBER) / ChannelMessage (引用回复)
       ├── GuestbookMessage (留言板)
       │
       ├── StickerPack ── Sticker (贴图包 & 贴图)
       ├── UserFile (用户文件) / ImportTask (导入任务)
       ├── ApiKey (开放平台密钥，含 scope)
       ├── UserGroup (用户组，权限聚合)
       │
       ├── ReferralLink ── ReferralClick / ReferralDailyStat / ReferralRecord
       ├── PointsTransaction (积分事务)
       ├── RedeemCode ── RedeemCodeRedemption
       ├── PaymentPackage ── PaymentOrder (USDT 套餐 & 订单)
       │
       ├── Ticket ── TicketReply (工单 & 回复，含分类/优先级/状态)
       │
       ├── Account / Session / Passkey / TwoFactor / Verification  (Better Auth)
       ├── VerificationCode / VerificationToken                    (邮箱验证码)
       ├── LoginSession (JWT 会话追踪)
       └── UserDevice (设备指纹) / SearchRecord (搜索记录)

Tag ── TagCategory / TagAlias / TagImplication (标签分类 / 别名 / 蕴含)
StoragePolicy (存储策略)
RankingSnapshot (榜单快照)
AdMetric (广告埋点统计)
SiteConfig (单例) ── 站点配置、公告、广告、备案信息
BackupRecord ── 数据库备份记录
FriendLink ── FriendLinkDailyStat (友情链接 & 每日点击/独立访客统计)
```

## SEO & AI 端点

| 路径                          | 说明                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `/sitemap.xml`                | 动态站点地图索引（拆分：视频/游戏/图片/用户/标签/静态页） |
| `/robots.txt`                 | 爬虫规则                                                  |
| `/feed.xml`、`/rss`           | RSS 订阅                                                  |
| `/llms.txt`、`/llms`          | AI/LLM 简要说明                                           |
| `/llms-full.txt`              | AI/LLM 完整说明                                           |
| `/api-docs`                   | 在线 API 文档                                             |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现                                          |
| `/.well-known/openapi.yaml`   | OpenAPI 规范                                              |
| `/.well-known/security.txt`   | 安全联络信息                                              |

视频、游戏、图片帖、合集在创建、更新、审核通过时自动提交 IndexNow + Google Search Console，支持手动批量提交。

## 富文本 & MDX

项目同时支持「编辑」与「渲染」两套富文本能力：

- **富文本编辑器**：`src/components/editor/` 基于 Tiptap 3，用于评论与投稿，支持工具栏、斜杠菜单、提及（@用户）、贴图与短代码。编辑结果以 Markdown 形式持久化。
- **客户端渲染**：`import { Markdown } from "@/components/ui/markdown"` —— 基于 react-markdown。
- **服务端渲染**：基于 `next-mdx-remote/rsc` 的 MDX 渲染器（`src/components/mdx/`）。
- **静态 MDX 页面**：在 `src/app/` 下创建 `.mdx` 文件即可作为路由页面，共享组件映射定义在 `mdx-components.tsx`。

## 更多文档

开发者文档集中在 [`docs/`](docs/)，按子系统拆分：

**部署与运维**
- [部署指南](deploy/README.md) —— Podman / PM2 / systemd / deploy.sh、Nginx 反代、Rathole 内网穿透、备份

**平台与基础设施**
- [开放平台 API（API Key）](docs/open-platform-api.md) —— 鉴权、scope 权限模型、限流、扩展方式（终端用户向导见站内 `/api-docs`）
- [全文搜索（Meilisearch）](docs/search-meilisearch.md) —— 索引配置、文档同步、查询与重建
- [实时通信（Socket.io）](docs/realtime-socketio.md) —— 双进程架构、房间约定、完整事件协议
- [权限、角色与用户组](docs/permissions-roles.md) —— Role、adminScopes、UserGroup、procedure 层级

**内容与媒体**
- [内容发布与审核](docs/content-moderation.md) —— 状态机、publishedAt 语义、审核副作用
- [封面生成系统](docs/cover-generation.md) —— 抽帧择优、Redis 队列、多格式编码与代理
- [文件与云存储](docs/files-storage.md) —— 上传/秒传、S3、云盘导入、SSRF 防护
- [排行榜系统](docs/ranking.md) —— 评分算法、快照、缓存与调度

**增长与运营**
- [积分与支付（USDT TRC-20）](docs/points-payment.md) —— 积分发放、链上监听、兑换码
- [推广 / 推荐系统](docs/referral.md) —— 推广链接、点击归因、注册/付费回填
- [广告系统](docs/ads.md) —— 广告位、广告门、定向排期、埋点
- [工单 / 反馈系统](docs/tickets.md) —— 生命周期、自动关闭、邮件与站内通知

**历史归档**
- [Next-Auth → Better Auth 迁移说明](docs/better-auth-migration.md)
- [升级到 ESLint 10 说明](docs/eslint-10-upgrade.md) —— 为何固定 ESLint 9 及升级方案

## License

[GNU AGPLv3](LICENSE)
