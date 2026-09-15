#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

if [[ ! -f .shadow-last-x-line-backup ]]; then
  echo "ERROR: .shadow-last-x-line-backup not found"
  exit 1
fi

BACKUP="$(cat .shadow-last-x-line-backup)"

if [[ ! -f "$BACKUP/si-current.css" || ! -f "$BACKUP/index.html" ]]; then
  echo "ERROR: backup files are missing: $BACKUP"
  exit 1
fi

cp "$BACKUP/si-current.css" public/si-current.css
cp "$BACKUP/index.html" public/index.html

echo "Rollback complete."
echo "Restored from: $BACKUP"
