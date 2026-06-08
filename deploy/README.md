# ACGN Platform 部署指南

## 架构概览

```
公网机 (Nginx + Rathole Server)
         |
         | TCP 隧道 (:2333)
         v
内网机 (Rathole Client)
    |-- Next.js (:3000)         ← Web 应用
    |-- Socket.io (:3001)       ← 实时通信 (私信/频道/通知/在线状态)
    |-- PostgreSQL (:5432)
    |-- Redis (:6379)           ← 缓存 + Socket.io Pub/Sub adapter
    |-- Meilisearch (:7700)     ← 全文搜索
```

## 技术栈

- **前端**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **后端**: tRPC, Prisma 7, Better Auth, Socket.io (实时通信)
- **数据库**: PostgreSQL 18, Redis 8 (缓存 + Socket.io Pub/Sub)
- **搜索**: Meilisearch (全文搜索)
- **内容渲染**: Tiptap (编辑器), MDX (next-mdx-remote + @next/mdx)
- **运行时**: Node.js 24
- **部署**: Podman Compose (rootless) / Docker Compose / PM2 / systemd / deploy.sh

## 服务组成

| 服务 | 端口 | 说明 |
|------|------|------|
| Next.js | 3000 | Web 应用（SSR + API + tRPC） |
| Socket.io | 3001 | 实时通信服务（私信、频道、通知、在线状态） |
| PostgreSQL | 5432 | 主数据库 |
| Redis | 6379 | 缓存、速率限制、Socket.io Pub/Sub |
| Meilisearch | 7700 | 全文搜索引擎 |

---

## 方式 A：Podman Compose Rootless（推荐）

Rootless Podman 无需 root 权限即可运行容器，安全性更高。

### 1. 安装 Podman

**Fedora / RHEL / CentOS Stream:**

```bash
sudo dnf install -y podman podman-compose
```

**Ubuntu / Debian:**

```bash
sudo apt install -y podman podman-compose
```

**Arch Linux:**

```bash
sudo pacman -S podman podman-compose
```

### 2. 配置 Rootless 环境

```bash
# 确保当前用户有 subuid/subgid 映射
grep $(whoami) /etc/subuid || sudo usermod --add-subuids 100000-165535 $(whoami)
grep $(whoami) /etc/subgid || sudo usermod --add-subgids 100000-165535 $(whoami)

# 允许非特权用户绑定 80 端口（可选，用于 PM2 直接监听 80）
# sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80
# echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee -a /etc/sysctl.d/99-unprivileged-ports.conf

# 启用 Podman socket（用于 compose）
systemctl --user enable --now podman.socket

# 使 Podman 在用户登出后继续运行
loginctl enable-linger $(whoami)
```

### 3. 从 GitHub 克隆项目

```bash
git clone https://github.com/AdingApkgg/moe-stream.git
cd moe-stream
```

### 4. 配置环境变量

```bash
cp .env.production.example .env.production
```

编辑 `.env.production`，配置必要的环境变量：

```bash
# 数据库（容器内连接，无需修改）
DATABASE_URL="postgresql://postgres:your_strong_password@postgres:5432/acgn?schema=public"
REDIS_URL="redis://redis:6379"

# Meilisearch（容器内连接，无需修改 URL；密钥两处需一致）
MEILISEARCH_URL="http://meilisearch:7700"
MEILISEARCH_MASTER_KEY="$(openssl rand -base64 32)"
MEILI_MASTER_KEY="（与 MEILISEARCH_MASTER_KEY 相同的值）"

# 认证
BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
BETTER_AUTH_BASE_URL="https://your-domain.com"

# 前端
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NEXT_PUBLIC_APP_NAME="你的站点名称"

# PostgreSQL 密码（与 DATABASE_URL 一致）
POSTGRES_PASSWORD="your_strong_password"
```

首次启动后，初始化搜索索引（容器内执行）：

```bash
podman compose exec app pnpm meili:reindex:prod
```

### 5. 构建并启动

```bash
# 全栈启动（PostgreSQL + Redis + Next.js + Socket.io）
podman compose up -d

# 首次启动需要初始化数据库
podman compose exec app npx prisma db push

# 查看所有服务状态
podman compose ps

# 查看日志
podman compose logs -f          # 全部
podman compose logs -f app      # 仅 Next.js
podman compose logs -f socket   # 仅 Socket.io
```

### 6. 仅启动基础设施（开发模式）

应用在宿主机运行，只用容器运行 PostgreSQL、Redis 和 Meilisearch：

```bash
podman compose up -d postgres redis meilisearch
```

### Rootless 常见问题

**端口被占用:**

```bash
# 查看占用进程
ss -tlnp | grep :3000
# 修改端口（在 .env.production 或 compose 命令中）
APP_PORT=8080 podman compose up -d
```

**权限问题（卷目录）:**

Rootless Podman 的卷默认由 Podman 管理，无需手动 chown。如果遇到权限问题：

```bash
podman unshare chown -R 1001:1001 /path/to/volume
```

**无法拉取镜像:**

```bash
# 确认 registries.conf 配置了 Docker Hub
cat /etc/containers/registries.conf
# 手动拉取
podman pull docker.io/library/postgres:18-alpine
podman pull docker.io/library/redis:8-alpine
podman pull docker.io/getmeili/meilisearch:v1.12
podman pull docker.io/library/node:24-alpine
```

---

## 方式 B：PM2（裸金属 / VPS）

适用于直接在服务器上运行，不使用容器。

### 1. 安装依赖

```bash
# Node.js 24 + pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
pnpm env use --global 24

# PostgreSQL 18
sudo apt install -y postgresql-18  # Debian/Ubuntu

# Redis 8
sudo apt install -y redis-server

# Meilisearch（参考官方文档安装，或用容器运行）
curl -L https://install.meilisearch.com | sh
# 也可仅用容器跑搜索引擎：podman compose up -d meilisearch

# PM2
pnpm add -g pm2
```

裸金属部署初始化数据库后，记得初始化搜索索引：`pnpm meili:init && pnpm meili:reindex:prod`。

### 2. 从 GitHub 克隆项目

```bash
git clone https://github.com/AdingApkgg/moe-stream.git
cd moe-stream
```

### 3. 安装 & 构建

```bash
cp .env.example .env
# 编辑 .env 配置

pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:push
pnpm db:seed   # 可选
pnpm build
```

### 4. 启动服务

```bash
# 启动 Next.js + Socket.io（PM2 管理）
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 设置开机自启
```

PM2 会同时管理两个进程：

| PM2 进程名 | 说明 |
|------------|------|
| `app` | Next.js 应用（端口 3000） |
| `app-socket` | Socket.io 服务（端口 3001） |

> 进程名前缀可用 `APP_NAME` 覆盖。Next.js 监听 3000，对外 80/443 由 Nginx 反代。

### 5. PM2 常用命令

```bash
pm2 status                    # 查看状态
pm2 logs                      # 查看全部日志
pm2 logs app                  # 仅 Next.js 日志
pm2 logs app-socket           # 仅 Socket.io 日志
pm2 restart all               # 重启全部
pm2 restart ecosystem.config.cjs  # 按配置重启
```

---

## 方式 C：deploy.sh 脚本（本地 → 远程）

本地打包源代码（~3MB），传输到服务器后构建。适用于远程服务器没有 GitHub 访问权限的场景。

```bash
# 配置 .env.deploy
DEPLOY_USER=deploy
DEPLOY_HOST=your-server.com
DEPLOY_PATH=/opt/app

# 部署
pnpm deploy              # 常规部署
pnpm deploy -- --full    # 完整部署（含 data/ 目录，首次需要）
```

脚本流程：打包源代码 → SCP 传输 → 服务器解压 → `pnpm install` → Prisma Generate → DB Push → Build → PM2 重启。

---

## 从 GitHub 拉取更新

### Podman Compose 环境

```bash
cd moe-stream

# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像（使用缓存加速）
podman compose build

# 3. 更新数据库 schema（如有变更）
podman compose run --rm app npx prisma db push

# 4. 重新启动服务（自动使用新镜像）
podman compose up -d

# 5. 清理旧镜像（可选，释放磁盘空间）
podman image prune -f
```

如果需要强制全量重新构建（代码变更后缓存未生效）：

```bash
podman compose build --no-cache
podman compose up -d
```

### PM2 环境

```bash
cd moe-stream

# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖（如有新增）
pnpm install --frozen-lockfile

# 3. 更新 Prisma Client & 数据库
pnpm db:generate
pnpm db:push

# 4. 重新构建
pnpm build

# 5. 重启服务
pm2 restart ecosystem.config.cjs
```

### deploy.sh 环境

```bash
# 本地执行，自动打包 → 传输 → 构建 → 重启
pnpm deploy
```

---

## 内网穿透（Rathole）

适用于服务器在内网，通过公网机中转流量。

### 内网机（客户端）

```bash
cp deploy/rathole-client.example.toml deploy/rathole-client.toml
# 编辑 remote_addr（公网机 IP）和 default_token
```

```bash
# 前台运行测试
rathole -c deploy/rathole-client.toml

# systemd 服务（持久运行）
sudo cp deploy/rathole-client.example.service /etc/systemd/system/rathole-client.service
# 编辑 ExecStart 路径
sudo systemctl enable --now rathole-client
```

### 公网机（服务端）

```bash
# 安装 Rathole
wget https://github.com/rapiz1/rathole/releases/latest/download/rathole-x86_64-unknown-linux-musl.zip
unzip rathole-x86_64-unknown-linux-musl.zip
sudo mv rathole /usr/local/bin/

# 配置
cp deploy/rathole-server.example.toml deploy/rathole-server.toml
# 编辑 default_token（与客户端一致）

# systemd 服务
sudo cp deploy/rathole-server.example.service /etc/systemd/system/rathole-server.service
sudo systemctl enable --now rathole-server
```

---

## Nginx 反向代理

公网机上配置 Nginx，将流量转发到 Rathole 隧道或本机应用。

### 安装 & 配置

```bash
sudo cp deploy/nginx-public.example.conf /etc/nginx/sites-available/app.conf
# 编辑 app.conf：
#   - 将 www.example.com 替换为你的域名
#   - 将 upstream 端口改为实际端口

sudo ln -s /etc/nginx/sites-available/app.conf /etc/nginx/sites-enabled/

# 申请 SSL 证书
sudo certbot certonly --webroot -w /var/www/certbot -d www.your-domain.com

# 验证 & 重载
sudo nginx -t && sudo systemctl reload nginx
```

### Nginx 特性

配置模板已包含：
- HTTP/2 + HTTP/3 (QUIC)
- TLS 1.2/1.3，HSTS preload
- Gzip 压缩
- API 限流（10r/s）、页面限流（30r/s）
- Next.js 静态资源长期缓存（1年，immutable）
- SEO 文件缓存（sitemap 1h、robots 1d）
- Service Worker 不缓存策略
- 安全头（X-Frame-Options、CSP、Permissions-Policy 等）

---

## 防火墙

```bash
# 公网机
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 443/udp    # HTTP/3 (QUIC)
sudo ufw allow 2333/tcp   # Rathole 隧道

# 内网机（如需外部直连）
sudo ufw allow 3000/tcp   # Next.js
sudo ufw allow 3001/tcp   # Socket.io
```

---

## 备份

### 数据库备份

```bash
# Podman 环境
podman compose exec postgres pg_dump -U postgres acgn > backup-$(date +%Y%m%d).sql

# 本地 PostgreSQL
pg_dump -U postgres acgn > backup-$(date +%Y%m%d).sql
```

### 恢复数据库

```bash
# Podman 环境
cat backup-20260313.sql | podman compose exec -T postgres psql -U postgres acgn

# 本地 PostgreSQL
psql -U postgres acgn < backup-20260313.sql
```

### 上传文件备份

```bash
tar -czvf uploads-backup-$(date +%Y%m%d).tar.gz uploads/
```

### 自动备份（crontab）

```bash
# 每天凌晨 3 点备份数据库
0 3 * * * cd /path/to/moe-stream && podman compose exec -T postgres pg_dump -U postgres acgn | gzip > /backup/db-$(date +\%Y\%m\%d).sql.gz

# 保留最近 30 天
0 4 * * * find /backup -name "db-*.sql.gz" -mtime +30 -delete
```

---

## 环境变量参考

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 | — |
| `REDIS_URL` | 是 | Redis 连接串 | — |
| `MEILISEARCH_URL` | 是 | Meilisearch 地址 | — |
| `MEILISEARCH_MASTER_KEY` | 是 | Meilisearch API 密钥 | — |
| `MEILI_MASTER_KEY` | 否 | Compose 中 meilisearch 容器读取（与上一项一致） | — |
| `BETTER_AUTH_SECRET` | 是 | Auth 密钥 | — |
| `BETTER_AUTH_BASE_URL` | 是 | 站点地址 | — |
| `NEXT_PUBLIC_APP_URL` | 是 | 前端访问地址 | — |
| `NEXT_PUBLIC_APP_NAME` | 是 | 站点名称 | — |
| `POSTGRES_USER` | 否 | PostgreSQL 用户名（Compose） | `postgres` |
| `POSTGRES_PASSWORD` | 否 | PostgreSQL 密码（Compose） | `postgres` |
| `POSTGRES_DB` | 否 | PostgreSQL 数据库名（Compose） | `acgn` |
| `APP_PORT` | 否 | Next.js 映射端口（Compose） | `3000` |
| `SOCKET_PORT` | 否 | Socket.io 映射端口（Compose） | `3001` |
| `APP_NAME` | 否 | 容器/PM2 进程名前缀 | `acgn` |
| `SMTP_HOST` | 否 | 邮件服务器 | — |
| `S3_ENDPOINT` | 否 | S3 兼容存储端点 | — |

---

## SEO 和 AI 端点

| 路径 | 说明 | 缓存 |
|------|------|------|
| `/sitemap.xml` | 动态站点地图 | 1h |
| `/robots.txt` | 爬虫规则 | 1d |
| `/feed.xml`、`/rss` | RSS 订阅 | 1h |
| `/llms.txt`、`/llms-full.txt` | AI/LLM 友好说明 | 1d |
| `/api-docs` | 在线 API 文档 | — |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现 | 1d |
| `/.well-known/openapi.yaml` | OpenAPI 规范 | 1d |
| `/.well-known/security.txt` | 安全联络信息 | 1d |
