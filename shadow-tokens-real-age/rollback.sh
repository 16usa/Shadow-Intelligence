#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-tokens-real-age-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"

cp "$B/src/db.mjs" src/db.mjs
cp "$B/server.mjs" server.mjs
cp "$B/src/adapters/token-market.mjs" src/adapters/token-market.mjs
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html

if [[ -f "$B/.had-v263-overlay" ]]; then
  cp "$B/public/si-tokens-card-fix.js" public/si-tokens-card-fix.js
else
  rm -f public/si-tokens-card-fix.js
fi

echo "Rollback complete."
echo "Restart the main Shadow/Replit app once."
