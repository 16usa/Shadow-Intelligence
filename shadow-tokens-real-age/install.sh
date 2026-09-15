#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

FILES=(
  "src/db.mjs"
  "server.mjs"
  "src/adapters/token-market.mjs"
  "public/app.js"
  "public/index.html"
)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-real-age-v2.6.4-${STAMP}"
mkdir -p "$BACKUP/src/adapters" "$BACKUP/src" "$BACKUP/public"

cp src/db.mjs "$BACKUP/src/db.mjs"
cp server.mjs "$BACKUP/server.mjs"
cp src/adapters/token-market.mjs "$BACKUP/src/adapters/token-market.mjs"
cp public/app.js "$BACKUP/public/app.js"
cp public/index.html "$BACKUP/public/index.html"

if [[ -f public/si-tokens-card-fix.js ]]; then
  cp public/si-tokens-card-fix.js "$BACKUP/public/si-tokens-card-fix.js"
  touch "$BACKUP/.had-v263-overlay"
fi

printf '%s\n' "$BACKUP" > .shadow-last-tokens-real-age-backup

python3 "$(dirname "$0")/patch.py"

rm -f public/si-tokens-card-fix.js

node --check server.mjs
node --check src/adapters/token-market.mjs
node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Real Age v2.6.4: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "IMPORTANT: restart the main Shadow/Replit app once."
echo "Then refresh Safari."
echo "1M needs roughly one minute between live samples before its first value."
