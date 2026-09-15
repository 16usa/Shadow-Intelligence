#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"
B="$(cat .shadow-last-tokens-period-age-backup)"
cp "$B/server.mjs" server.mjs
cp "$B/src/adapters/token-market.mjs" src/adapters/token-market.mjs
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html
if [[ -f "$B/.had-css" ]]; then cp "$B/public/si-token-sort.css" public/si-token-sort.css; else rm -f public/si-token-sort.css; fi
echo "Rollback complete. Restart Shadow once."
