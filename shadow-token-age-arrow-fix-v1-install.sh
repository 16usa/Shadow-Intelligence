#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: run this patch from inside the Shadow-Intelligence repository."
  exit 1
fi
cd "$ROOT"

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

case "$ORIGIN" in
  *16usa/Shadow-Intelligence*) ;;
  *) echo "ERROR: wrong repository: $ORIGIN"; exit 1 ;;
esac

[ "$BRANCH" = "main" ] || { echo "ERROR: expected main, found $BRANCH"; exit 1; }

[ -f public/app.js ] || { echo "ERROR: missing public/app.js"; exit 1; }

grep -q "SHADOW_TOKEN_SORT_COMPACT_ENT_V391_STATE" public/app.js || {
  echo "ERROR: compact token sorting patch is not present."
  exit 1
}

python3 shadow-token-age-arrow-fix-v1.py

node --check public/app.js

grep -q "SHADOW_TOKEN_AGE_ARROW_FIX_V392" public/app.js
grep -Fq "tokenAgeDirection==='oldest'?'↓':'↑'" public/app.js

echo
echo "Shadow Token Age Arrow Fix v1 applied successfully."
echo "Age down = older first / larger age."
echo "Age up = newer first / smaller age."
echo "MC and ENT were not changed."
echo "No server restart was performed."
