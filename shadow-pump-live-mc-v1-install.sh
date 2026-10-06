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

for f in \
  src/adapters/token-market.mjs \
  server.mjs \
  src/internal-copy-engine.mjs \
  public/app.js
do
  [ -f "$f" ] || {
    echo "ERROR: missing $f"
    exit 1
  }
done

python3 shadow-pump-live-mc-v1.py

node --check src/adapters/token-market.mjs
node --check src/internal-copy-engine.mjs
node --check server.mjs
node --check public/app.js

grep -q "SHADOW_PUMP_LIVE_MC_V394" src/adapters/token-market.mjs
grep -q "SHADOW_PUMP_LIVE_MC_V394_API" server.mjs
grep -q "getPumpTokenMarketCap" src/internal-copy-engine.mjs
grep -q "SHADOW_PUMP_LIVE_MC_V394_CLIENT" public/app.js

echo
echo "Shadow Pump Live MC v1 applied successfully."
echo "USD market cap now comes only from Pump.fun coins-v2."
echo "DexScreener marketCap/fdv is ignored."
echo "Helius is not used for market cap."
echo "Token detail refreshes one mint from Pump.fun every 3 seconds."
echo "Copy BUY MC range checks Pump.fun directly and fails closed if MC is unavailable."
echo "No server restart was performed."
