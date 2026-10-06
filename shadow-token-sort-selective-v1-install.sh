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

[ "$BRANCH" = "main" ] || {
  echo "ERROR: expected main, found $BRANCH"
  exit 1
}

for f in public/app.js public/si-current.css; do
  [ -f "$f" ] || {
    echo "ERROR: missing $f"
    exit 1
  }
done

grep -q "SHADOW_TOKEN_VOLATILITY_SORT_V393_STATE" public/app.js || {
  echo "ERROR: volatility sorting patch is not present."
  exit 1
}

grep -q "SHADOW_TOKEN_AGE_ARROW_FIX_V392" public/app.js || {
  echo "ERROR: Age arrow fix is not present."
  exit 1
}

python3 shadow-token-sort-selective-v1.py

node --check public/app.js

grep -q "SHADOW_TOKEN_SORT_SELECTIVE_V395_STATE" public/app.js
grep -q "data-token-period-off" public/app.js
grep -q "tokenPriceEnabled" public/app.js
grep -q "activeCount" public/app.js
grep -q "SHADOW_TOKEN_SORT_SELECTIVE_V395_CSS" public/si-current.css

echo
echo "Shadow Token Sort Selective v1 applied successfully."
echo "Time popup now includes Off."
echo "Age / MC / ENT / VOL cycle down -> up -> OFF -> down."
echo "Only enabled criteria participate in the joint score."
echo "Weights are redistributed equally across enabled criteria."
echo "No server restart was performed."
