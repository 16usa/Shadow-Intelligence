#!/bin/sh
set -eu

python3 apply_sync_orphan_subscription_fix_v30.py

ok=1
node --check server.mjs || ok=0
node --check public/sync.js || ok=0

if [ "$ok" -ne 1 ]; then
  cp server.mjs.bak-orphan-sub-v30 server.mjs
  cp public/sync.js.bak-orphan-sub-v30 public/sync.js
  echo "ERROR: syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC ORPHAN SUBSCRIPTION FIX V30 PATCH COMPLETE"
echo "Manual Replit restart required once."
