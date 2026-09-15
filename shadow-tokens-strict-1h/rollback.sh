#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-tokens-strict-1h-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"
cp "$B/server.mjs" server.mjs
cp "$B/src/adapters/token-market.mjs" src/adapters/token-market.mjs
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html

echo "Rollback complete."
echo "Restart the main Shadow/Replit app once, then refresh Safari."
