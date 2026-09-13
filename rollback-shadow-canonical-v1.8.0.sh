#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/workspace}"
BACKUP="/home/runner/workspace/.shadow-backups/canonical-v1.8.0-20260913-164651"
if [ ! -f "$BACKUP/files-before.tgz" ]; then
  echo "Rollback archive missing: $BACKUP/files-before.tgz"
  exit 1
fi
tar -xzf "$BACKUP/files-before.tgz" -C "$ROOT"
echo "Rollback complete."
echo "Restored files from: $BACKUP"
