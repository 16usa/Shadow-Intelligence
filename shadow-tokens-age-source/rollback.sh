#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

B="$(cat .shadow-last-tokens-age-source-backup)"
cp "$B/server.mjs" server.mjs
cp "$B/shadow-intelligence.db" shadow-intelligence.db

echo "Rollback complete."
echo "Restart the main Shadow/Replit app once."
