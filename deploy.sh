#!/bin/bash
# 快速部署脚本：本地打包 → 传输 → 服务器构建
#
# 只传输源代码（约 3MB），在服务器上构建
#
# 用法:
#   ./deploy.sh           # 常规部署
#   ./deploy.sh --full    # 完整部署（含 data/ 目录）

set -e

# ============================================================
# 配置
# ============================================================
DEPLOY_USER="${DEPLOY_USER:-i}"
DEPLOY_HOST="${DEPLOY_HOST:-205.198.64.243}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/i/mikiacg}"
DEPLOY_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_step() { echo -e "\n${GREEN}▶ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }

# ============================================================
# 参数解析
# ============================================================
FULL_DEPLOY=false

for arg in "$@"; do
    case $arg in
        --full) FULL_DEPLOY=true ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --full     完整部署（包含 data/ 目录，首次需要）"
            echo "  -h, --help 显示帮助"
            exit 0
            ;;
    esac
done

# ============================================================
# 开始部署
# ============================================================
START_TIME=$(date +%s)
ARCHIVE="/tmp/mikiacg-deploy.tar.gz"

echo ""
echo "=========================================="
echo "  咪咔次元 快速部署"
echo "  目标: ${DEPLOY_TARGET}:${DEPLOY_PATH}"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. 打包源代码（不含 node_modules 和 .next）
log_step "打包源代码..."

EXCLUDES=(
    --exclude='node_modules'
    --exclude='.git'
    --exclude='.next'
    --exclude='.pnpm-store'
    --exclude='uploads/*'
    --exclude='.env.development'
    --exclude='.env.production.local'
    --exclude='.env.local'
    --exclude='.history'
    --exclude='.cursor'
    --exclude='.vscode'
    --exclude='*.log'
    --exclude='.DS_Store'
)

# 默认不包含 data 目录
if [ "$FULL_DEPLOY" = false ]; then
    EXCLUDES+=(--exclude='data')
    log_info "跳过 data/ 目录（使用 --full 首次部署）"
fi

# macOS: 使用 --no-mac-metadata 或 COPYFILE_DISABLE 排除扩展属性
COPYFILE_DISABLE=1 tar "${EXCLUDES[@]}" -czf "$ARCHIVE" .
ARCHIVE_SIZE=$(du -h "$ARCHIVE" | cut -f1)
log_success "打包完成: ${ARCHIVE_SIZE}"

# 2. 传输到服务器
log_step "传输到服务器..."
scp -C "$ARCHIVE" "${DEPLOY_TARGET}:/tmp/"
log_success "传输完成"

# 3. 服务器解压并构建
log_step "服务器构建..."

ssh "${DEPLOY_TARGET}" "bash -l" << DEPLOY_SCRIPT
set -e

# 加载 pnpm 和 node 环境
export PNPM_HOME="\$HOME/.local/share/pnpm"
export PATH="\$PNPM_HOME:\$PATH"
export NODE_ENV=production

cd ${DEPLOY_PATH}

echo "📦 解压文件..."
tar -xzf /tmp/mikiacg-deploy.tar.gz --overwrite 2>/dev/null
rm /tmp/mikiacg-deploy.tar.gz

echo "📥 安装依赖..."
pnpm install --frozen-lockfile

echo "🔧 生成 Prisma Client..."
pnpm db:generate

echo "🗄️  同步数据库..."
pnpm db:push

echo "🔨 构建项目..."
pnpm build

echo "🚀 重启服务..."
pm2 restart mikiacg 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save
DEPLOY_SCRIPT

# 4. 清理
rm -f "$ARCHIVE"

# ============================================================
# 完成
# ============================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
log_success "部署完成！"
echo "  耗时: ${DURATION} 秒"
echo "  地址: https://mikiacg.vip"
echo "=========================================="
