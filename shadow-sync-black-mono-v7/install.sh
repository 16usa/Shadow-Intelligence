#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC v6 is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-black-mono-v7-backup
for f in public/sync.html public/sync.css public/sync.js; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-black-mono-v7-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check public/sync.js

echo
echo "SHADOW SYNC BLACK MONO v7 installed."
echo "Changes:"
echo "  - Pure black background #000000"
echo "  - 0.5px separator lines"
echo "  - IBM Plex Mono across the entire SYNC page"
echo "  - Decorative background glows removed"
echo "  - Functional green/red accents preserved"
echo
echo "No restart was performed."
