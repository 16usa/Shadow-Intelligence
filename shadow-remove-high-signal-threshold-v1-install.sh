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

for f in public/index.html public/app.js server.mjs src/db.mjs; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-remove-high-signal-threshold-v1.py

node --check public/app.js
node --check server.mjs
node --check src/db.mjs

! grep -q "setRiskThreshold" public/index.html
! grep -q "setRiskThreshold" public/app.js
! grep -q "risk_high_threshold" server.mjs
! grep -q "risk_high_threshold" src/db.mjs

echo
echo "Shadow High Signal Threshold removal applied successfully."
echo "The unused setting was removed from UI, client save/load, server allowlist and DB defaults."
echo "No server restart was performed."
