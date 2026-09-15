#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

for f in public/app.js public/index.html; do
  [[ -f "$f" ]] || { echo "ERROR: missing $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-joint-sort-v2.6.8-${STAMP}"
mkdir -p "$BACKUP/public"

cp public/app.js "$BACKUP/public/app.js"
cp public/index.html "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-tokens-joint-sort-backup

python3 "$(dirname "$0")/patch.py"
node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Joint Sort v2.6.8: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
