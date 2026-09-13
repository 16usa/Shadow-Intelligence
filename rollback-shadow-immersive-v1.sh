#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LATEST_FILE=".shadow-backups/immersive-map-ui-v1.latest"
if [[ ! -f "$LATEST_FILE" ]]; then
  echo "ERROR: No immersive UI backup pointer found." >&2
  exit 1
fi
BACKUP_DIR="$(cat "$LATEST_FILE")"
if [[ ! -f "$BACKUP_DIR/public/index.html" ]]; then
  echo "ERROR: Backup is incomplete: $BACKUP_DIR" >&2
  exit 1
fi
cp -p "$BACKUP_DIR/public/index.html" public/index.html
if [[ "$(cat "$BACKUP_DIR/si-immersive.was-present" 2>/dev/null || echo absent)" == "present" && -f "$BACKUP_DIR/public/si-immersive.css" ]]; then
  cp -p "$BACKUP_DIR/public/si-immersive.css" public/si-immersive.css
else
  rm -f public/si-immersive.css
fi
if [[ "$(cat "$BACKUP_DIR/rollback-script.was-present" 2>/dev/null || echo absent)" == "present" && -f "$BACKUP_DIR/rollback-shadow-immersive-v1.sh" ]]; then
  cp -p "$BACKUP_DIR/rollback-shadow-immersive-v1.sh" rollback-shadow-immersive-v1.sh
fi
echo "Rollback complete from: $BACKUP_DIR"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git status --short -- public/index.html public/si-immersive.css rollback-shadow-immersive-v1.sh || true
fi
