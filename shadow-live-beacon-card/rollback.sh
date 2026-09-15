#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"
B="$(cat .shadow-last-live-beacon-card-backup)"
cp "$B/public/si-top-movers.js" public/si-top-movers.js
cp "$B/public/si-top-movers.css" public/si-top-movers.css
cp "$B/public/index.html" public/index.html
echo "Rollback complete. Refresh Safari."
