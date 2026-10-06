#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC v4 is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-cleanup-v5-backup
for f in public/sync.html public/sync.css public/sync.js; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-cleanup-v5-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check public/sync.js

echo
echo "SHADOW SYNC CLEANUP v5 installed."
echo "Changes:"
echo "  - Removed FUSION MARK chip"
echo "  - Removed LEADER ACTIVITY eyebrow"
echo "  - Kept Live signals"
echo "  - Kept ONE LEADER / CONNECTED counters unchanged"
echo "  - Kept START COPYING / STOP COPYING unchanged"
echo
echo "No restart was performed."
