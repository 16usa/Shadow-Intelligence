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

for f in public/app.js public/si-current.css; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

grep -q "SHADOW_TOKEN_SORT_COMPACT_ENT_V391_STATE" public/app.js || {
  echo "ERROR: compact token sorting patch is not present."
  exit 1
}

grep -q "SHADOW_TOKEN_AGE_ARROW_FIX_V392" public/app.js || {
  echo "ERROR: Age arrow fix is not present."
  exit 1
}

python3 shadow-token-volatility-sort-v1.py

node --check public/app.js

grep -q "SHADOW_TOKEN_VOLATILITY_SORT_V393_STATE" public/app.js
grep -q "data-token-vol" public/app.js
grep -q "total:(price+age+mc+entities+volatility)/5" public/app.js
grep -q "repeat(5,minmax(0,1fr))" public/si-current.css

echo
echo "Shadow Token Volatility Sort v1 applied successfully."
echo "VOL is tied to the selected time window and uses absolute percent movement."
echo "VOL down = larger movement ranks higher; VOL up = smaller movement ranks higher."
echo "All five joint-sort criteria now have equal 20% weight."
echo "No server restart was performed."
