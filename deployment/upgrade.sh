#!/bin/bash

# 仓库管理系统 - 在线升级脚本
# 支持零停机升级（Zero-downtime deployment）
#
# 使用方法：
# ./upgrade.sh [version]
#
# 例如：
# ./upgrade.sh v1.2.0   # 升级到指定版本
# ./upgrade.sh          # 升级到最新版本

set -e  # 遇到错误立即退出

# ========== 配置变量 ==========

PROJECT_DIR="/var/www/storage-management"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKUP_DIR="$PROJECT_DIR/backups"
GIT_BRANCH="main"
TARGET_VERSION="${1:-latest}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ========== 辅助函数 ==========

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# ========== 前置检查 ==========

log_info "开始升级检查..."

# 检查必要的命令
check_command git
check_command npm
check_command pm2
check_command mysql

# 检查是否在正确的目录
if [ ! -d "$BACKEND_DIR" ]; then
    log_error "后端目录不存在: $BACKEND_DIR"
    exit 1
fi

# 检查 PM2 是否运行
if ! pm2 list | grep -q "storage-management"; then
    log_error "PM2 未运行 storage-management 应用"
    exit 1
fi

# ========== 创建备份 ==========

log_info "创建备份..."

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

mkdir -p "$BACKUP_PATH"

# 备份代码
log_info "备份代码..."
rsync -a --exclude 'node_modules' --exclude 'logs' --exclude '.git' \
    "$PROJECT_DIR/" "$BACKUP_PATH/"

# 备份数据库
log_info "备份数据库..."
source "$BACKEND_DIR/.env"
mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_PATH/database_backup.sql"

log_info "备份完成: $BACKUP_PATH"

# ========== 拉取最新代码 ==========

log_info "拉取最新代码..."

cd "$PROJECT_DIR"

# 保存当前版本（用于回滚）
CURRENT_COMMIT=$(git rev-parse HEAD)
log_info "当前版本: $CURRENT_COMMIT"

# 拉取代码
git fetch origin "$GIT_BRANCH"

if [ "$TARGET_VERSION" = "latest" ]; then
    git checkout "$GIT_BRANCH"
    git pull origin "$GIT_BRANCH"
else
    git checkout "$TARGET_VERSION"
fi

NEW_COMMIT=$(git rev-parse HEAD)
log_info "新版本: $NEW_COMMIT"

# 如果版本没有变化，询问是否继续
if [ "$CURRENT_COMMIT" = "$NEW_COMMIT" ]; then
    log_warn "代码版本没有变化，是否继续升级？(y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "升级已取消"
        exit 0
    fi
fi

# ========== 安装依赖 ==========

log_info "安装后端依赖..."
cd "$BACKEND_DIR"
npm install --production

# ========== 数据库迁移 ==========

log_info "检查数据库迁移..."

# 如果有 migrations 目录，执行迁移
if [ -d "$BACKEND_DIR/migrations" ]; then
    log_info "执行数据库迁移..."
    # 这里可以添加你的数据库迁移命令
    # npm run migrate
else
    log_info "无需数据库迁移"
fi

# ========== 重启应用（零停机）==========

log_info "重启应用（零停机）..."

# PM2 reload 实现零停机重启
pm2 reload ecosystem.config.js --update-env

# 等待应用启动
sleep 5

# 检查应用状态
if pm2 list | grep "storage-management" | grep -q "online"; then
    log_info "应用重启成功"
else
    log_error "应用重启失败，开始回滚..."
    rollback
    exit 1
fi

# ========== 健康检查 ==========

log_info "执行健康检查..."

# 检查 API 是否正常
HEALTH_CHECK_URL="http://localhost:3000/health"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL")

if [ "$HTTP_STATUS" = "200" ]; then
    log_info "健康检查通过 ✓"
else
    log_error "健康检查失败 (HTTP $HTTP_STATUS)，开始回滚..."
    rollback
    exit 1
fi

# ========== 清理旧备份 ==========

log_info "清理旧备份（保留最近 5 个）..."

cd "$BACKUP_DIR"
ls -t | tail -n +6 | xargs -r rm -rf

# ========== 完成 ==========

log_info "=========================================="
log_info "升级成功完成！"
log_info "当前版本: $NEW_COMMIT"
log_info "备份位置: $BACKUP_PATH"
log_info "=========================================="

# ========== 回滚函数 ==========

rollback() {
    log_warn "开始回滚到上一个版本..."

    cd "$PROJECT_DIR"
    git checkout "$CURRENT_COMMIT"

    cd "$BACKEND_DIR"
    npm install --production

    pm2 reload ecosystem.config.js --update-env

    log_info "回滚完成"
}

# ========== 使用说明 ==========

# 升级流程说明：
# 1. 自动创建备份（代码 + 数据库）
# 2. 拉取最新代码
# 3. 安装依赖
# 4. 执行数据库迁移（如果有）
# 5. PM2 零停机重启（reload 命令会逐个重启实例）
# 6. 健康检查
# 7. 如果失败，自动回滚
# 8. 清理旧备份（保留最近 5 个）

# 零停机原理：
# PM2 的 reload 命令会：
# 1. 启动新的进程实例
# 2. 等待新实例就绪
# 3. 逐个关闭旧实例
# 4. 确保始终有实例在处理请求

# 如果需要完全停机升级，使用 restart 代替 reload：
# pm2 restart ecosystem.config.js --update-env
