# 咪咔次元 (Mikiacg)

ACGN 流式媒体内容分享平台。不存储视频文件，仅通过用户提供的直链加载视频。

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript + Turbopack
- **样式**: Tailwind CSS v4 + shadcn/ui
- **状态**: Zustand + TanStack Query
- **API**: tRPC + Zod
- **认证**: NextAuth.js v5
- **数据库**: PostgreSQL + Prisma 7
- **缓存**: Redis + ioredis
- **播放器**: react-player + hls.js

## 开始开发

### 1. 安装依赖

```bash
pnpm install
pnpm approve-builds  # 批准依赖的构建脚本
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
pnpm db:generate

# 推送数据库 schema
pnpm db:push

# (可选) 填充初始数据
pnpm db:seed
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 可用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (Turbopack, 端口 3000) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:push` | 推送 schema 到数据库 |
| `pnpm db:migrate` | 运行数据库迁移 |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm db:seed` | 填充初始数据 |

## 生产部署

### 部署流程（本地构建 → 服务器运行）

**一键部署（推荐）：**

```bash
# 配置环境变量
export DEPLOY_USER=i
export DEPLOY_HOST=your-server.com
export DEPLOY_PATH=/home/i/acgn-flow

# 运行部署脚本
pnpm deploy
```

**手动部署：**

本地电脑：

```bash
# 1. 开发
pnpm dev

# 2. 构建生产版本
pnpm build

# 3. 同步到服务器
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'uploads/*' \
  --exclude 'logs/*' \
  --exclude '.git' \
  ./ user@server:/path/to/mikiacg/
```

服务器：

```bash
# 1. 安装生产依赖
pnpm install --prod

# 2. 同步数据库 schema（如有变更）
pnpm db:push

# 3. 启动/重启服务
pm2 restart mikiacg || pm2 start ecosystem.config.cjs
```

### PM2 管理

```bash
# 查看状态
pm2 status mikiacg

# 查看日志
pm2 logs mikiacg

# 重启
pm2 restart mikiacg

# 停止
pm2 stop mikiacg
```

## 目录结构

```
mikiacg/
├── prisma/              # Prisma schema 和种子数据
├── src/
│   ├── app/             # Next.js App Router 页面
│   ├── components/      # React 组件
│   │   ├── layout/      # 布局组件
│   │   ├── ui/          # shadcn/ui 组件
│   │   └── video/       # 视频相关组件
│   ├── lib/             # 工具函数
│   ├── server/          # 服务端代码
│   │   └── routers/     # tRPC routers
│   └── stores/          # Zustand stores
├── deploy/              # 部署配置文件
├── uploads/             # 上传文件目录
└── ecosystem.config.cjs # PM2 配置
```

## SEO & AI 端点

| 路径 | 说明 |
|------|------|
| `/sitemap.xml` | 动态站点地图 |
| `/robots.txt` | 爬虫规则 |
| `/feed.xml` | RSS 订阅 |
| `/llms.txt` | AI/LLM 友好说明 |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现 |

## License

[GNU AGPLv3](LICENSE)
