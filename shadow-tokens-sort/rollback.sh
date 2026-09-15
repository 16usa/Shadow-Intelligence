#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-tokens-sort-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"
cp "$B/public/app.js" public/app.js
cp "$B/public/index.html" public/index.html

if [[ -f "$B/.had-css" ]]; then
  cp "$B/public/si-token-sort.css" public/si-token-sort.css
else
  rm -f public/si-token-sort.css
fi

echo "Rollback complete. Refresh Safari."
