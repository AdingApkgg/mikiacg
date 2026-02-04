#!/bin/bash
# 部署脚本：本地构建后同步到服务器

set -e

export DEPLOY_USER=i
export DEPLOY_HOST=205.198.64.243
export DEPLOY_PATH=/home/i/mikiacg

# 配置
SERVER_USER="${DEPLOY_USER:-i}"
SERVER_HOST="${DEPLOY_HOST:-your-server.com}"
SERVER_PATH="${DEPLOY_PATH:-/home/i/mikiacg}"

echo "🔨 构建生产版本..."
pnpm build

echo "📦 同步到服务器 ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'uploads/*' \
  --exclude 'logs/*' \
  --exclude '.git' \
  --exclude '.next/cache' \
  ./ "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"

echo "🚀 在服务器上安装依赖并重启服务..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cd ${SERVER_PATH} && pnpm install --prod && pm2 restart mikiacg || pm2 start ecosystem.config.cjs"

echo "✅ 部署完成！"
