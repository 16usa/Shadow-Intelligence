#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/public/sync.html" || ! -f "$PROJECT_DIR/public/sw.js" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-push-option1-v4-backup
for f in public/sync.html public/sync.css public/sync.js public/sync-logo.svg public/sync-favicon.svg; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-push-option1-v4-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js
cp "$PATCH_DIR/public/sync-logo.svg" public/sync-logo.svg
cp "$PATCH_DIR/public/sync-favicon.svg" public/sync-favicon.svg

node --check public/sync.js

echo
echo "SHADOW SYNC PUSH + OPTION 1 v4 installed."
echo "Changes:"
echo "  - Correct Option 1 Fusion Mark"
echo "  - Trade alerts toggle in Copy Settings"
echo "  - BUY / SELL Web Push through existing Shadow push engine"
echo "  - iPhone Home Screen guidance"
echo "  - Test notification button"
echo
echo "No restart was performed."
