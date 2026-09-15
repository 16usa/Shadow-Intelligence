#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/workspace}"
cd "$ROOT"
for f in server.mjs src/adapters/token-market.mjs public/app.js public/index.html; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-period-age-v2.6.1-${STAMP}"
mkdir -p "$BACKUP/src/adapters" "$BACKUP/public"
cp server.mjs "$BACKUP/server.mjs"
cp src/adapters/token-market.mjs "$BACKUP/src/adapters/token-market.mjs"
cp public/app.js "$BACKUP/public/app.js"
cp public/index.html "$BACKUP/public/index.html"
if [[ -f public/si-token-sort.css ]]; then cp public/si-token-sort.css "$BACKUP/public/si-token-sort.css"; touch "$BACKUP/.had-css"; fi
printf '%s\n' "$BACKUP" > .shadow-last-tokens-period-age-backup
cp "$(dirname "$0")/si-token-sort.css" public/si-token-sort.css
python3 "$(dirname "$0")/patch.py"
node --check server.mjs
node --check src/adapters/token-market.mjs
node --check public/app.js
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then git diff --check; fi
echo
echo "Shadow Tokens Period + Age v2.6.1: INSTALLED"
echo "Backup: $BACKUP"
echo "IMPORTANT: restart the main Shadow/Replit app once."
