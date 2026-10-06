#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -d "$PROJECT_DIR/public" || ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-fusion-mark-v3-backup
for f in public/sync.html public/sync.css public/sync.js public/sync-logo.svg public/sync-favicon.svg; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-fusion-mark-v3-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js
cp "$PATCH_DIR/public/sync-logo.svg" public/sync-logo.svg
cp "$PATCH_DIR/public/sync-favicon.svg" public/sync-favicon.svg

node --check public/sync.js

echo
echo "SHADOW SYNC FUSION MARK v3 installed."
echo "Changes:"
echo "  - Fusion Mark added next to SYNC in header"
echo "  - Fusion Mark chip added in hero section"
echo "  - SYNC favicon added"
echo "  - Centered X and single LIVE status preserved"
echo
echo "No restart was performed."
