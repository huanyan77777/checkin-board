#!/usr/bin/env bash
set -euo pipefail
APP=/opt/checkin-board
dnf install -y curl ca-certificates
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi
id checkin >/dev/null 2>&1 || useradd --system --home "$APP" --shell /sbin/nologin checkin
mkdir -p "$APP/current" "$APP/shared/data" "$APP/shared/backups" "$APP/shared/uploads"
chown -R checkin:checkin "$APP"
echo "Node: $(node -v)"; echo "完成基础运行时安装。接下来上传应用到 $APP/current，并配置 $APP/shared/.env。"
