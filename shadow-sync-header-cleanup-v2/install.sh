#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -d "$PROJECT_DIR/public" || ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC v1 is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-header-cleanup-v2-backup
cp public/sync.html .shadow-sync-header-cleanup-v2-backup/sync.html
cp public/sync.css  .shadow-sync-header-cleanup-v2-backup/sync.css
cp public/sync.js   .shadow-sync-header-cleanup-v2-backup/sync.js

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check public/sync.js

echo
echo "SHADOW SYNC HEADER CLEANUP v2 installed."
echo "Changes:"
echo "  - SYNC: no green dot"
echo "  - X logo: centered in header"
echo "  - LIVE: single global status on the right"
echo "  - Leader: green dot only, no ONLINE text"
echo "  - Live signals: duplicate LIVE badge removed"
echo
echo "No restart was performed."
