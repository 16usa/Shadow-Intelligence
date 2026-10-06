#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC v5 is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-header-no-live-v6-backup
for f in public/sync.html public/sync.css public/sync.js; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-header-no-live-v6-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check public/sync.js

echo
echo "SHADOW SYNC HEADER NO LIVE v6 installed."
echo "Changes:"
echo "  - Removed global LIVE from the right side of the header"
echo "  - Kept X exactly centered"
echo "  - Kept SYNC + logo on the left"
echo "  - No other UI or logic changed"
echo
echo "No restart was performed."
