#!/usr/bin/env bash
set -euo pipefail
DATA_DIR="${DATA_DIR:-/opt/checkin-board/shared/data}"
BACKUP_DIR="${BACKUP_DIR:-/opt/checkin-board/shared/backups}"
mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)
sqlite3 "$DATA_DIR/checkin.sqlite" ".backup '$BACKUP_DIR/checkin-$stamp.sqlite'"
find "$BACKUP_DIR" -type f -name 'checkin-*.sqlite' -mtime +14 -delete
echo "backup written: $BACKUP_DIR/checkin-$stamp.sqlite"
