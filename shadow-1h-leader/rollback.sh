#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"
B="$(cat .shadow-last-fastest-1h-backup)"
cp "$B/server.mjs" server.mjs
cp "$B/src/adapters/token-market.mjs" src/adapters/token-market.mjs
cp "$B/public/si-top-movers.js" public/si-top-movers.js
cp "$B/public/si-top-movers.css" public/si-top-movers.css
cp "$B/public/index.html" public/index.html
echo "Rollback complete. Restart Shadow once."
