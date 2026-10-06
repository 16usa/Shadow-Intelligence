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
    echo "ERROR: wrong repository: $ORIGIN"
    exit 1
    ;;
esac

if [ "$BRANCH" != "main" ]; then
  echo "ERROR: expected branch main, found: $BRANCH"
  exit 1
fi

for f in src/live-intelligence.mjs src/internal-copy-engine.mjs server.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-fast-copy-hot-path-v2.py

node --check src/live-intelligence.mjs
node --check src/internal-copy-engine.mjs
node --check server.mjs

grep -q "SHADOW_FAST_COPY_HOT_PATH_V370" src/live-intelligence.mjs
grep -q "SHADOW_FAST_COPY_ENGINE_EVENT_V373" src/internal-copy-engine.mjs
grep -q "onFastTrade:event=>internalCopyEngine.handleTradeEvent" server.mjs

echo
echo "Shadow Fast Copy Hot Path v2 repaired successfully."
echo "Realtime detection -> copy engine wiring is now complete."
echo "External token/market enrichment remains outside the critical path."
echo "The delegated-vault production security gate remains unchanged."
echo "No server restart was performed."
