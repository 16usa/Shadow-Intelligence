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

for f in src/live-intelligence.mjs src/internal-copy-engine.mjs public/index.html public/app.js public/styles.css; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-copy-latency-meter-v1.py

node --check src/live-intelligence.mjs
node --check src/internal-copy-engine.mjs
node --check public/app.js

grep -q "SHADOW_COPY_LATENCY_METER_V380_LIVE" src/live-intelligence.mjs
grep -q "SHADOW_COPY_LATENCY_METER_V380_ENGINE" src/internal-copy-engine.mjs
grep -q "copyLatencyLast" public/index.html
grep -q "refreshCopyLatencyMeter" public/app.js

echo
echo "Shadow Copy Latency Meter v1 applied successfully."
echo "System page now shows live Webhook->Engine, Engine decision, Internal total and rolling P95 latency."
echo "Metrics refresh every 2 seconds while the System page is open."
echo "No server restart was performed."
