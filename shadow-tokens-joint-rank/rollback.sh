#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

B="$(cat .shadow-last-tokens-joint-rank-backup)"
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html

echo "Rollback complete. Refresh Safari."
