#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

MARKER=".shadow-last-x-hairline-backup"

if [[ ! -f "$MARKER" ]]; then
  echo "ERROR: $MARKER not found"
  exit 1
fi

BACKUP="$(cat "$MARKER")"

if [[ ! -f "$BACKUP/si-current.css" || ! -f "$BACKUP/index.html" ]]; then
  echo "ERROR: backup files missing: $BACKUP"
  exit 1
fi

cp "$BACKUP/si-current.css" public/si-current.css
cp "$BACKUP/index.html" public/index.html

echo "Rollback complete."
echo "Restored from: $BACKUP"
