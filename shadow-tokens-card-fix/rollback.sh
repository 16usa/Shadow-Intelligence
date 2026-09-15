#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

MARKER=".shadow-last-tokens-card-fix-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

B="$(cat "$MARKER")"
cp "$B/public/index.html" public/index.html

if [[ -f "$B/.had-js" ]]; then
  cp "$B/public/si-tokens-card-fix.js" public/si-tokens-card-fix.js
else
  rm -f public/si-tokens-card-fix.js
fi

echo "Rollback complete. Refresh Safari."
