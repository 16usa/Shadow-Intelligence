#!/bin/sh
set -eu
FILE="src/internal-copy-engine.mjs"
PATCH="sync_tp_sl_v15/internal-copy-engine.mjs"
EXPECTED="5c9799ea408032ecd94bf339f2536f331d9b51f60a1a9be7fcce86feab79abd5"
BACKUP="src/internal-copy-engine.mjs.bak-tp-sl-v15"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run this from ~/workspace."
  exit 1
fi
if [ ! -f "$PATCH" ]; then
  echo "ERROR: patch payload missing: $PATCH"
  exit 1
fi
if grep -q 'SYNC_TP_SL_EXECUTOR_V15' "$FILE"; then
  echo "SYNC TP/SL EXECUTOR V15 ALREADY INSTALLED"
  node --check "$FILE"
  exit 0
fi
ACTUAL="$(sha256sum "$FILE" | awk '{print $1}')"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: current executor changed since the export."
  echo "Expected: $EXPECTED"
  echo "Actual:   $ACTUAL"
  echo "No files were changed."
  exit 2
fi
cp "$FILE" "$BACKUP"
cp "$PATCH" "$FILE"
if ! node --check "$FILE"; then
  cp "$BACKUP" "$FILE"
  echo "ERROR: syntax check failed; original executor restored."
  exit 3
fi

echo "SYNC TP/SL EXECUTOR V15 INSTALLED"
echo "Backup: $BACKUP"
echo "Installed logic: actual BUY fill -> tracked entry -> TP/SL monitor -> atomic Leader Sell/TP/SL close -> duplicate protection"
echo "Mainnet program ID and wallet secrets were not changed."
grep -n 'SYNC_TP_SL_EXECUTOR_V15\|tpSlMonitor' "$FILE" | head -20
