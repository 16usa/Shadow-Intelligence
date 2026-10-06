#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: run this patch from inside the Shadow-Intelligence git repository."
  exit 1
fi

cd "$ROOT"

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

case "$ORIGIN" in
  *16usa/Shadow-Intelligence*) ;;
  *)
    echo "ERROR: this does not look like 16usa/Shadow-Intelligence."
    echo "origin: $ORIGIN"
    exit 1
    ;;
esac

if [ "$BRANCH" != "main" ]; then
  echo "ERROR: expected branch main, found: $BRANCH"
  exit 1
fi

for f in public/app.js server.mjs src/db.mjs src/adapters/copy-trading.mjs src/internal-copy-engine.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-copy-trade-market-cap-range-v1.py

node --check src/db.mjs
node --check server.mjs
node --check public/app.js
node --check src/adapters/copy-trading.mjs
node --check src/internal-copy-engine.mjs

echo
echo "Shadow Copy Trade Market Cap Range v1 applied successfully."
echo "Min/Max Market Cap are stored per copy subscription."
echo "Market-cap policy applies to BUY only; sells bypass it."
echo "If a range is configured and current MC is unavailable, policy is fail-closed: skip buy."
echo "No server restart was performed."
