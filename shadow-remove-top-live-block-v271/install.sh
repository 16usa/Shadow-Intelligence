#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

for f in public/index.html public/app.js; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/remove-top-live-block-v2.7.1-${STAMP}"
mkdir -p "$BACKUP"
export SHADOW_TOP_BLOCK_BACKUP="$BACKUP"

printf '%s\n' "$BACKUP" > .shadow-last-remove-top-live-block-v271-backup

python3 "$(dirname "$0")/patch.py"

node --check public/app.js
node --check public/si-remove-top-live-card.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Remove Top Live Block v2.7.1: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
