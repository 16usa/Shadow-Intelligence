#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(pwd)"

if [[ ! -f "$PROJECT_DIR/public/sync.html" ]]; then
  echo "ERROR: Run this from the Shadow-Intelligence repository root after SYNC v9 is installed."
  exit 1
fi

cd "$PROJECT_DIR"

mkdir -p .shadow-sync-three-black-levels-v10-backup
for f in public/sync.html public/sync.css public/sync.js; do
  if [[ -f "$f" ]]; then
    cp "$f" ".shadow-sync-three-black-levels-v10-backup/$(basename "$f")"
  fi
done

cp "$PATCH_DIR/public/sync.html" public/sync.html
cp "$PATCH_DIR/public/sync.css" public/sync.css
cp "$PATCH_DIR/public/sync.js" public/sync.js

node --check public/sync.js

echo
echo "SHADOW SYNC THREE BLACK LEVELS v10 installed."
echo "Changes:"
echo "  - Pure black page background"
echo "  - Slightly lighter input surfaces"
echo "  - One more level for secondary controls and badges"
echo "  - 0.5px separators preserved"
echo "  - IBM Plex Mono preserved"
echo "  - Soft green glow preserved"
echo
echo "No restart was performed."
