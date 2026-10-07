#!/bin/sh
set -eu

python3 apply_sync_stop_reclaim_v21b.py

if ! node --check server.mjs; then
  cp server.mjs.bak-stop-reclaim-v21b server.mjs
  cp public/sync.js.bak-stop-reclaim-v21b public/sync.js
  echo "ERROR: server syntax check failed; originals restored."
  exit 1
fi
if ! node --check public/sync.js; then
  cp server.mjs.bak-stop-reclaim-v21b server.mjs
  cp public/sync.js.bak-stop-reclaim-v21b public/sync.js
  echo "ERROR: sync.js syntax check failed; originals restored."
  exit 1
fi
if ! node --check src/sync-vault-reclaim.mjs; then
  cp server.mjs.bak-stop-reclaim-v21b server.mjs
  cp public/sync.js.bak-stop-reclaim-v21b public/sync.js
  echo "ERROR: reclaim module syntax check failed; originals restored."
  exit 1
fi
if ! node --check public/execution-reclaim.js; then
  cp server.mjs.bak-stop-reclaim-v21b server.mjs
  cp public/sync.js.bak-stop-reclaim-v21b public/sync.js
  echo "ERROR: reclaim UI syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC STOP RECLAIM V21B PATCH COMPLETE"
echo "Manual Replit restart required once."
