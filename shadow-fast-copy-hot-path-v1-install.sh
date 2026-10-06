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

for f in src/live-intelligence.mjs src/internal-copy-engine.mjs server.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-fast-copy-hot-path-v1.py

node --check src/live-intelligence.mjs
node --check src/internal-copy-engine.mjs
node --check server.mjs

echo
echo "Shadow Fast Copy Hot Path v1 applied successfully."
echo "Realtime webhook processing no longer waits for token-market or SOL/USD network calls before copy-engine dispatch."
echo "Token/market enrichment now runs in the background."
echo "Fast-path latency counters are exposed through the existing live/engine status."
echo "The existing delegated-vault security/mainnet execution gate remains unchanged."
echo "No server restart was performed."
