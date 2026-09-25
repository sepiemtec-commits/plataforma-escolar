#!/usr/bin/env bash
# Backup automático agendável — SOMENTE ambiente DR/staging (TOKEN 12).
# Cron exemplo: 0 * * * * /path/to/tests/dr/scripts/backup-auto.sh >> /tmp/veho-dr-backup.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$ROOT/tests/dr/backups/auto-$STAMP"
mkdir -p "$OUT"

if ! docker ps --format '{{.Names}}' | grep -qx 'veho-mongo-dr'; then
  echo "veho-mongo-dr não está rodando" >&2
  exit 1
fi

docker exec veho-mongo-dr rm -rf /tmp/veho_auto_dump >/dev/null
docker exec veho-mongo-dr mongodump --db veho_dr --out /tmp/veho_auto_dump >/dev/null
docker cp veho-mongo-dr:/tmp/veho_auto_dump/veho_dr "$OUT/"

# checksum simples
(
  cd "$OUT/veho_dr"
  sha256sum *.bson 2>/dev/null | sha256sum | awk '{print $1}'
) > "$OUT/INTEGRITY.sha256"

echo "$OUT"
