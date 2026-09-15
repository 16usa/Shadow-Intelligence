#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-tokens-remove-1h-label-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html

echo "Rollback complete. Refresh Safari."
