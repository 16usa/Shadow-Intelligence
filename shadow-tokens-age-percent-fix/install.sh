#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

for f in server.mjs public/app.js public/index.html; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-age-percent-fix-v2.6.2-${STAMP}"
mkdir -p "$BACKUP/public"

cp server.mjs "$BACKUP/server.mjs"
cp public/app.js "$BACKUP/public/app.js"
cp public/index.html "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-tokens-age-percent-fix-backup

python3 "$(dirname "$0")/patch.py"

node --check server.mjs
node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Age + Percent Fix v2.6.2: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "IMPORTANT: restart the main Shadow/Replit app once."
echo "After restart, 1M needs about one minute to obtain its first real comparison point."
