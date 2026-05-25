# ACGN Platform

ACGN 流式媒体内容分享平台。不存储视频文件，仅通过用户提供的直链（MP4 / HLS）加载视频，同时提供游戏资源、图片投稿分享。

## 功能特性

**视频**
- 直链投稿（MP4 / M3U8 / WebM），支持分P、合集/剧集
- HLS 自适应码率播放（hls.js）
- 收藏、点赞/踩、观看历史、自定义播放列表
- 标签分类、全站搜索、关联视频
- 自动封面生成（Sharp）

**游戏**
- 游戏资源投稿，支持多平台下载链接
- 分类（ADV / SLG / RPG / ACT 等）、标签筛选
- 收藏、点赞/踩、游戏截图展示、游戏内置视频播放

**图片**
- 图片投稿，标签分类
- 收藏、点赞/踩、观看历史
- 图片查看器（大图浏览）
- 图片评论

**社区**
- 注册 / 登录用户 + 匿名访客评论（视频 & 游戏 & 图片）
- 评论回复、点赞/踩、置顶、软删除
- 邮箱验证码登录 / 注册、密码重置
- 两步验证（2FA / Passkey）
- 多账号切换、登录会话管理
- 排行榜、全站统计

**通讯系统**
- 站内通知（评论回复、点赞、收藏、关注、审核状态、系统公告），实时推送 + 通知铃铛
- 关注系统（关注/取关、粉丝/关注列表、关注数统计）
- 私信（1 对 1 会话、消息历史、未读计数）
- 聊天频道（公开/私有频道、成员管理与角色、引用回复）
- 输入指示器、已读回执、在线状态
- 聊天中发送图片/文件、表情包 & 贴图选择器
- Socket.io 实时双向通信，Redis Pub/Sub 多实例扩展

**贴图 & 表情**
- 贴图包管理（创建 / 上传 / 分类）
- 评论和聊天中嵌入贴图
- 内置 Emoji 选择器

**推荐 & 积分 & 支付**
- 推荐链接系统（生成 / 追踪点击 / 每日统计）
- 积分系统（积分事务记录）
- 兑换码（生成 / 批量 / 兑换）
- USDT / TRC-20 支付（支付套餐、订单管理、Tron 链上监控）

**管理后台** (`/dashboard`)
- 视频 & 游戏 & 图片审核（待审 / 通过 / 驳回）
- 用户管理（封禁 / 权限 / 投稿资格）
- 评论管理、标签管理、友情链接管理
- 合集管理、封面管理
- 贴图包管理
- 推荐系统管理、积分管理、支付 & 套餐管理
- 数据库备份管理
- 站点配置（公告、功能开关、SEO、广告系统）
- 细粒度管理员权限范围（`adminScopes`）

**其他**
- PWA 支持（Serwist Service Worker，离线缓存静态资源）
- MDX 富文本内容（视频/游戏描述）
- 广告系统 & 广告门（可配置点击次数/免广告时长）
- IndexNow + Google Search Console 主动推送
- SEO 全套（Sitemap / RSS / robots.txt / JSON-LD / Open Graph）
- AI/LLM 友好端点（llms.txt / ai-plugin.json / OpenAPI）
- IP 属地显示（ip2region）、设备指纹追踪
- 深色/浅色主题切换、音效反馈
- 键盘快捷键 & 命令面板
- S3 兼容对象存储（文件上传）
- 初始化向导（`/setup`）
- 法律页面（关于、隐私政策、服务条款）

## 技术栈

| 层级         | 技术                                                                 |
| ------------ | -------------------------------------------------------------------- |
| **框架**     | Next.js 16 + React 19 + TypeScript                                   |
| **构建**     | Turbopack (开发)                                                     |
| **样式**     | Tailwind CSS v4 + shadcn/ui + Framer Motion                          |
| **状态**     | Zustand + TanStack Query                                             |
| **API**      | tRPC v11 + Zod v4                                                    |
| **认证**     | Better Auth（JWT 策略，邮箱验证码，2FA / Passkey，多账号切换）       |
| **数据库**   | PostgreSQL 18 + Prisma 7（pg adapter）                               |
| **缓存**     | Redis 8 + ioredis                                                    |
| **实时通信** | Socket.io + @socket.io/redis-adapter（独立进程，Redis Pub/Sub 扩展） |
| **对象存储** | AWS S3 兼容（@aws-sdk/client-s3）                                    |
| **播放器**   | react-player + hls.js                                                |
| **3D**       | Three.js + React Three Fiber（登陆页动效）                           |
| **内容**     | MDX（@next/mdx + next-mdx-remote）                                   |
| **PWA**      | Serwist（Service Worker + 运行时缓存）                               |
| **图像**     | Sharp（封面生成 & 处理）                                             |
| **邮件**     | Nodemailer（SMTP）                                                   |
| **支付**     | USDT TRC-20（tron-monitor）                                          |
| **部署**     | Podman / Docker Compose / PM2 / deploy.sh                            |

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

编辑 `.env.development`，必填项：

| 变量                     | 说明                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `DATABASE_URL`           | PostgreSQL 连接串                                                   |
| `REDIS_URL`              | Redis 连接串                                                        |
| `MEILISEARCH_URL`        | Meilisearch 地址（本地 `http://127.0.0.1:7700`）                    |
| `MEILISEARCH_MASTER_KEY` | Meilisearch API 密钥（与 `MEILI_MASTER_KEY` 在 Compose 中保持一致） |
| `BETTER_AUTH_SECRET`     | Auth 密钥（`openssl rand -base64 32`）                              |
| `BETTER_AUTH_BASE_URL`   | 站点地址（开发环境 `http://localhost:3000`）                        |
| `NEXT_PUBLIC_APP_URL`    | 前端访问地址（开发环境 `http://localhost:3000`）                    |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io 地址（开发环境 `http://localhost:3001`）                  |
| `NEXT_PUBLIC_APP_NAME`   | 站点名称                                                            |

可选项：`SMTP_*`（邮件）、`INDEXNOW_KEY`（搜索引擎推送）、`GOOGLE_*`（Search Console）、`S3_*`（对象存储）。

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

`compose.yaml` 会把容器端口暴露到宿主机：PostgreSQL `5432`、Redis `6379`、Meilisearch `7700`。如需改端口，可在 `.env.development` 中设置 `POSTGRES_PORT`、`REDIS_PORT`、`MEILISEARCH_PORT`，并同步修改对应连接 URL。

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

| 命令               | 说明                                                         |
| ------------------ | ------------------------------------------------------------ |
| `pnpm dev`         | 启动开发服务器（Next.js 端口 3000 + Socket.io 端口 3001）    |
| `pnpm dev:next`    | 仅启动 Next.js（Turbopack, 端口 3000）                       |
| `pnpm dev:socket`  | 仅启动 Socket.io 服务器（端口 3001）                         |
| `pnpm build`       | 构建生产版本（Prisma Generate → Next Build → Serwist Build） |
| `pnpm start`       | 启动生产服务器                                               |
| `pnpm lint`        | 运行 ESLint + TypeScript 类型检查                            |
| `pnpm lint:eslint` | 仅运行 ESLint                                                |
| `pnpm typecheck`   | 仅运行 TypeScript 类型检查（tsc --noEmit）                   |

### 数据库

| 命令               | 说明                 |
| ------------------ | -------------------- |
| `pnpm db:generate` | 生成 Prisma Client   |
| `pnpm db:push`     | 推送 schema 到数据库 |
| `pnpm db:migrate`  | 运行数据库迁移       |
| `pnpm db:studio`   | 打开 Prisma Studio   |
| `pnpm db:seed`     | 填充初始数据         |

### Docker / Podman Compose

| 命令                 | 说明                                                               |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm compose:infra` | 启动 PostgreSQL + Redis + Meilisearch 容器（开发用）               |
| `pnpm compose:up`    | 生产式容器全栈启动，需 `.env.production`                           |
| `pnpm compose:down`  | 停止开发基础服务对应的 Compose 容器                                |
| `pnpm compose:logs`  | 查看开发基础服务对应的 Compose 日志                                |
| `pnpm compose:build` | 使用 `.env.production` 重新构建生产式容器镜像                      |
| `pnpm compose:ps`    | 查看 Compose 服务状态                                              |
| `pnpm compose:prod:down` | 停止生产式容器全栈                                             |
| `pnpm compose:prod:logs` | 查看生产式容器全栈日志                                         |

`pnpm compose:down` 不会删除 named volumes。不要使用 `compose down -v`，否则 `postgres_data`、`redis_data`、`meilisearch_data` 中的本地数据会被删除。

### PM2

| 命令               | 说明                                 |
| ------------------ | ------------------------------------ |
| `pnpm pm2:start`   | 启动 PM2 进程（Next.js + Socket.io） |
| `pnpm pm2:stop`    | 停止 PM2 进程                        |
| `pnpm pm2:restart` | 重启 PM2 进程                        |
| `pnpm pm2:logs`    | 查看 PM2 日志                        |
| `pnpm pm2:status`  | 查看 PM2 状态                        |

### 运维脚本

| 命令                       | 说明                       |
| -------------------------- | -------------------------- |
| `pnpm script:create-user`  | 创建用户                   |
| `pnpm script:create-owner` | 创建站长账号（OWNER 角色） |
| `pnpm script:migrate-auth` | Better Auth 数据迁移       |
| `pnpm script:fetch-videos` | 导入旧站视频数据           |
| `pnpm script:fetch-games`  | 导入旧站游戏数据           |

`scripts/` 目录下还包含更多维护脚本：`fetch-legacy-images.ts`（导入旧站图片）、`merge-duplicate-videos.ts`（合并重复视频）、`migrate-user-ids.ts` / `migrate-video-ids.ts`（ID 迁移）、`randomize-video-ids.ts`（随机化视频 ID）、`generate-covers.ts`（批量生成封面）。

## 生产部署

### 方式 A：Podman Compose Rootless（推荐）

支持 rootless Podman，无需 root 权限，安全性更高。

```bash
git clone https://github.com/AdingApkgg/moe-stream.git
cd moe-stream
cp .env.production.example .env.production
# 编辑 .env.production

# 全栈启动（PostgreSQL + Redis + Next.js + Socket.io）
podman compose up -d

# 初始化数据库
podman compose exec app npx prisma db push
```

容器使用多阶段构建（Node 22 Alpine + pnpm），非 root 用户运行。Next.js 和 Socket.io 作为独立容器分别管理。

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

### 方式 C：deploy.sh 脚本（本地 → 远程）

本地打包源代码（~3MB），传输到服务器后构建。

```bash
# 配置 .env.deploy（DEPLOY_USER / DEPLOY_HOST / DEPLOY_PATH）
pnpm deploy              # 常规部署
pnpm deploy -- --full    # 完整部署（含 data/ 目录，首次需要）
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
│   └── create-owner.ts      # 创建站长脚本
├── scripts/                 # 运维 & 迁移脚本
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── (auth)/          # 认证页面 (登录/注册/找回密码/2FA)
│   │   ├── dashboard/       # 管理后台
│   │   │   ├── videos/      #   视频管理
│   │   │   ├── games/       #   游戏管理
│   │   │   ├── images/      #   图片管理
│   │   │   ├── tags/        #   标签管理
│   │   │   ├── comments/    #   评论管理
│   │   │   ├── users/       #   用户管理
│   │   │   ├── series/      #   合集管理
│   │   │   ├── covers/      #   封面管理
│   │   │   ├── stickers/    #   贴图包管理
│   │   │   ├── links/       #   友情链接
│   │   │   ├── referral/    #   推荐系统
│   │   │   ├── points/      #   积分管理
│   │   │   ├── payment/     #   支付 & 套餐管理
│   │   │   ├── backups/     #   备份管理
│   │   │   └── settings/    #   站点设置
│   │   ├── settings/        # 用户设置
│   │   │   ├── account/     #   账号信息
│   │   │   ├── sessions/    #   登录会话
│   │   │   └── danger/      #   危险操作
│   │   ├── notifications/   # 通知中心
│   │   ├── messages/        # 私信页面 (双栏: 会话列表 + 消息线程)
│   │   ├── channels/        # 聊天频道
│   │   │   └── [slug]/      #   频道聊天页面
│   │   ├── video/           # 视频详情 & 编辑
│   │   ├── game/            # 游戏详情 & 编辑
│   │   ├── image/           # 图片详情 & 编辑
│   │   ├── series/          # 合集详情
│   │   ├── search/          # 搜索
│   │   ├── upload/          # 投稿
│   │   ├── profile/         # 个人资料
│   │   ├── user/[id]/       # 用户主页
│   │   ├── tag/[slug]/      # 标签页
│   │   ├── tags/            # 标签列表
│   │   ├── ranking/         # 排行榜
│   │   ├── stats/           # 全站统计
│   │   ├── my-works/        # 我的作品
│   │   ├── my-series/       # 我的合集
│   │   ├── favorites/       # 收藏列表
│   │   ├── history/         # 观看历史
│   │   ├── comments/        # 我的评论
│   │   ├── links/           # 友情链接页
│   │   ├── setup/           # 初始化向导
│   │   ├── r/[code]/        # 推荐链接跳转
│   │   ├── about/           # 关于
│   │   ├── terms/           # 服务条款
│   │   ├── privacy/         # 隐私政策
│   │   ├── api/             # API 路由
│   │   │   ├── trpc/        #   tRPC handler
│   │   │   ├── auth/        #   Better Auth + session-info
│   │   │   ├── upload/      #   文件上传
│   │   │   ├── cover/       #   封面代理/缓存
│   │   │   ├── email/       #   邮件验证码 (发送/验证)
│   │   │   ├── captcha/     #   验证码
│   │   │   └── indexnow/    #   搜索引擎推送
│   │   ├── uploads/         # 上传文件代理路由
│   │   ├── sitemap/         # 站点地图 (视频/游戏/图片/用户/标签/静态页)
│   │   ├── feed.xml/        # RSS
│   │   ├── llms.txt/        # LLM 端点
│   │   ├── llms-full.txt/   # LLM 完整端点
│   │   ├── .well-known/     # ai-plugin.json / openapi.yaml / security.txt
│   │   ├── manifest.ts      # PWA Manifest
│   │   └── sw.ts            # Service Worker
│   ├── components/
│   │   ├── layout/          # 布局 (Header/Footer/Sidebar/底部导航/命令面板)
│   │   ├── ui/              # shadcn/ui 基础组件 (~40+)
│   │   ├── video/           # 视频组件 (卡片/网格/播放器/封面/表单)
│   │   ├── game/            # 游戏组件 (卡片/网格/视频播放器)
│   │   ├── image/           # 图片组件 (卡片/查看器)
│   │   ├── comment/         # 评论组件 (视频/游戏/图片评论、表情贴图选择器)
│   │   ├── notifications/   # 通知组件 (铃铛/列表/详情)
│   │   ├── messages/        # 私信组件 (会话列表/消息线程/输入框)
│   │   ├── shared/          # 通讯共享组件 (输入指示器/在线状态/贴图选择器/文件上传)
│   │   ├── admin/           # 管理组件 (权限转移/封面面板/合集面板)
│   │   ├── effects/         # 视觉特效 (3D 登陆场景/粒子背景)
│   │   ├── ads/             # 广告组件 (广告门/广告位/广告卡片)
│   │   ├── mdx/             # MDX 渲染器
│   │   ├── seo/             # SEO (JSON-LD)
│   │   ├── stats/           # 统计组件
│   │   ├── motion/          # Framer Motion 动画
│   │   ├── auth/            # 社交登录按钮
│   │   ├── socket-provider.tsx   # Socket.io 连接管理
│   │   ├── analytics-scripts.tsx # 分析脚本注入
│   │   ├── legal-page.tsx        # 法律页面模板
│   │   └── providers.tsx         # 全局 Providers
│   ├── lib/                 # 工具库
│   │   ├── auth.ts          #   Better Auth 服务端配置
│   │   ├── auth-client.ts   #   Better Auth 客户端
│   │   ├── prisma.ts        #   Prisma 客户端
│   │   ├── trpc.ts          #   tRPC 客户端
│   │   ├── redis.ts         #   Redis 客户端
│   │   ├── socket-client.ts #   Socket.io 客户端单例
│   │   ├── socket-emitter.ts #  Socket.io Redis Emitter (tRPC → Socket.io)
│   │   ├── notification.ts  #   通知创建与推送
│   │   ├── s3-client.ts     #   S3 对象存储客户端
│   │   ├── email.ts         #   Nodemailer
│   │   ├── captcha.ts       #   验证码
│   │   ├── indexnow.ts      #   IndexNow 推送
│   │   ├── google-indexing.ts  # Google 索引 API
│   │   ├── ip-location.ts   #   IP 属地解析
│   │   ├── device-info.ts   #   设备信息解析
│   │   ├── cover*.ts        #   封面生成系统 (config/generator/queue/auto)
│   │   ├── avatar.ts        #   头像生成/处理
│   │   ├── format.ts        #   格式化工具
│   │   ├── constants.ts     #   常量定义
│   │   ├── points.ts        #   积分工具
│   │   ├── usdt-payment.ts  #   USDT 支付
│   │   ├── tron-monitor.ts  #   Tron 链上监控
│   │   ├── sticker-presets.ts # 预设贴图包
│   │   ├── shortcode-parser.ts # 短代码解析
│   │   ├── backup.ts        #   备份工具
│   │   ├── setup.ts         #   初始化向导
│   │   ├── site-config.ts   #   站点配置
│   │   ├── server-config.ts #   服务端配置
│   │   ├── ads.ts           #   广告配置
│   │   ├── audio.ts         #   音效
│   │   ├── toast-with-sound.ts # 带音效的 toast
│   │   ├── theme-styles.ts  #   主题样式
│   │   ├── hooks.ts         #   通用 hooks
│   │   ├── bcrypt-wasm.ts   #   WASM bcrypt
│   │   ├── wasm-hash.ts     #   WASM 哈希
│   │   └── utils.ts         #   通用工具 (cn 等)
│   ├── socket/              # Socket.io 服务端
│   │   ├── server.ts        #   入口（HTTP + Socket.io + Redis adapter）
│   │   ├── auth.ts          #   连接认证中间件（Better Auth 会话验证）
│   │   └── handlers/        #   事件处理器
│   │       ├── notification.ts  # 通知事件
│   │       ├── message.ts   #   私信事件 (加入房间/输入指示器)
│   │       ├── channel.ts   #   频道事件 (加入房间/输入指示器)
│   │       └── presence.ts  #   在线状态 (Redis 追踪)
│   ├── server/              # 服务端
│   │   ├── trpc.ts          #   tRPC 上下文 & 过程定义
│   │   └── routers/         #   tRPC 路由
│   │       ├── _app.ts      #     根路由（聚合全部子路由）
│   │       ├── video.ts     #     视频 CRUD
│   │       ├── game.ts      #     游戏 CRUD
│   │       ├── image.ts     #     图片 CRUD
│   │       ├── series.ts    #     合集
│   │       ├── tag.ts       #     标签
│   │       ├── user.ts      #     用户
│   │       ├── comment.ts   #     视频评论
│   │       ├── game-comment.ts  # 游戏评论
│   │       ├── image-comment.ts # 图片评论
│   │       ├── admin.ts     #     管理后台
│   │       ├── site.ts      #     站点数据
│   │       ├── setup.ts     #     初始化向导
│   │       ├── sticker.ts   #     贴图包
│   │       ├── referral.ts  #     推荐系统
│   │       ├── redeem.ts    #     兑换码
│   │       ├── payment.ts   #     支付
│   │       ├── notification.ts  # 通知 (列表/已读/删除)
│   │       ├── follow.ts    #     关注 (关注/取关/列表/计数)
│   │       ├── message.ts   #     私信 (会话/发送/历史/已读)
│   │       └── channel.ts   #     频道 (创建/加入/消息/成员管理)
│   ├── hooks/               # React Hooks
│   │   ├── use-socket.ts    #   Socket.io 连接生命周期
│   │   ├── use-notifications.ts  # 实时通知监听
│   │   ├── use-typing.ts    #   输入指示器
│   │   ├── use-sound.ts     #   音效播放
│   │   ├── use-keyboard-shortcuts.ts  # 键盘快捷键
│   │   ├── use-fingerprint.ts  # 设备指纹
│   │   ├── use-ads.ts       #   广告逻辑
│   │   ├── use-tilt.ts      #   3D 倾斜效果
│   │   ├── use-page-param.ts   # URL 页码参数
│   │   └── use-tab-param.ts    # URL Tab 参数
│   ├── stores/              # Zustand 状态
│   │   ├── app.ts           #   应用状态
│   │   ├── user.ts          #   用户状态
│   │   └── socket.ts        #   Socket.io 状态 (连接/在线用户/未读计数)
│   └── generated/           # Prisma 生成代码 (gitignore)
├── deploy/                  # 部署配置
│   ├── nginx-public.example.conf  # Nginx 配置模板 (SSL/HTTP2/HTTP3)
│   ├── rathole-*.example.toml     # Rathole 内网穿透配置模板
│   ├── *.example.service          # systemd 服务文件模板
│   └── README.md                  # 部署指南
├── uploads/                 # 上传文件目录
├── compose.yaml             # Podman / Docker Compose (rootless 兼容)
├── Dockerfile               # 多阶段构建 (Next.js + Socket.io 双 target)
├── ecosystem.config.cjs     # PM2 配置 (Next.js + Socket.io 双进程)
├── serwist.config.js        # PWA Service Worker 配置
├── deploy.sh                # 一键部署脚本
└── mdx-components.tsx       # Next.js MDX 约定文件
```

## 数据模型

核心模型关系：

```
User ──┬── Video ──┬── Tag (多对多)
       │           ├── Series / SeriesEpisode
       │           ├── Comment (支持匿名 + 嵌套回复)
       │           ├── Like / Dislike / Confused
       │           ├── Favorite
       │           ├── WatchHistory
       │           └── Playlist / PlaylistItem
       │
       ├── Game ───┬── Tag (多对多)
       │           ├── GameComment
       │           ├── GameLike / GameDislike / GameFavorite
       │           └── GameViewHistory
       │
       ├── ImagePost ─┬── Tag (多对多)
       │              ├── ImagePostComment
       │              ├── ImagePostLike / ImagePostDislike / ImagePostFavorite
       │              └── ImagePostViewHistory
       │
       ├── Follow (关注者 ↔ 被关注者，自引用多对多)
       ├── Notification (站内通知，支持多类型 + JSON 扩展数据)
       │
       ├── Conversation ──┬── ConversationParticipant
       │                  └── DirectMessage (私信，支持文本/图片/文件/贴图)
       │
       ├── Channel ───┬── ChannelMember (角色: OWNER/ADMIN/MEMBER)
       │              └── ChannelMessage (频道消息，支持引用回复)
       │
       ├── StickerPack ── Sticker (贴图包 & 贴图)
       │
       ├── ReferralLink ─┬── ReferralClick (点击追踪)
       │                 ├── ReferralDailyStat (每日统计)
       │                 └── ReferralRecord (推荐记录)
       │
       ├── PointsTransaction (积分事务)
       ├── RedeemCode ── RedeemCodeRedemption (兑换码 & 兑换记录)
       ├── PaymentPackage ── PaymentOrder (支付套餐 & 订单)
       │
       ├── LoginSession (JWT 会话追踪)
       ├── UserDevice (设备指纹)
       └── SearchRecord

SiteConfig (单例) ── 站点配置、公告、广告、备案信息
BackupRecord ── 数据库备份记录
FriendLink ── 友情链接
       └── FriendLinkDailyStat (每日点击/独立访客统计)
```

## SEO & AI 端点

| 路径                          | 说明                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `/sitemap.xml`                | 动态站点地图索引（拆分：视频/游戏/图片/用户/标签/静态页） |
| `/robots.txt`                 | 爬虫规则                                                  |
| `/feed.xml`                   | RSS 订阅                                                  |
| `/llms.txt`                   | AI/LLM 简要说明                                           |
| `/llms-full.txt`              | AI/LLM 完整说明                                           |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现                                          |
| `/.well-known/openapi.yaml`   | OpenAPI 规范                                              |
| `/.well-known/security.txt`   | 安全联络信息                                              |

视频和游戏在创建、更新、审核通过时自动提交 IndexNow + Google Search Console，支持手动批量提交。

## MDX 支持

项目支持使用 MDX 渲染富文本内容（视频/游戏描述等）。

- **客户端渲染**: `import { Markdown } from "@/components/ui/markdown"` — 基于 react-markdown
- **服务端渲染**: `import { MdxContent } from "@/components/mdx/mdx-remote"` — 基于 next-mdx-remote/rsc
- **静态 MDX 页面**: 在 `src/app/` 下创建 `.mdx` 文件即可作为路由页面

共享组件映射和样式定义在 `src/components/mdx/mdx-components.tsx`。

## License

[GNU AGPLv3](LICENSE)
