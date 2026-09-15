#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

for f in server.mjs shadow-intelligence.db; do
  [[ -e "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-age-source-v2.6.5-${STAMP}"
mkdir -p "$BACKUP"

cp server.mjs "$BACKUP/server.mjs"
cp shadow-intelligence.db "$BACKUP/shadow-intelligence.db"
printf '%s\n' "$BACKUP" > .shadow-last-tokens-age-source-backup

python3 "$(dirname "$0")/patch.py"

echo
echo "Rechecking Pump token creation timestamps..."
node "$(dirname "$0")/backfill-age.mjs"

node --check server.mjs

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Age Source v2.6.5: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "IMPORTANT: restart the main Shadow/Replit app once."
echo "Then refresh Safari."
