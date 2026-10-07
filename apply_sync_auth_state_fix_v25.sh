#!/bin/sh
set -eu

python3 apply_sync_auth_state_fix_v25.py

if ! node --check src/internal-copy-engine.mjs; then
  cp src/internal-copy-engine.mjs.bak-auth-state-v25 src/internal-copy-engine.mjs
  cp public/execution-authorize.js.bak-auth-state-v25 public/execution-authorize.js
  echo "ERROR: engine syntax check failed; originals restored."
  exit 1
fi

if ! node --check public/execution-authorize.js; then
  cp src/internal-copy-engine.mjs.bak-auth-state-v25 src/internal-copy-engine.mjs
  cp public/execution-authorize.js.bak-auth-state-v25 public/execution-authorize.js
  echo "ERROR: authorization UI syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC AUTH STATE FIX V25 PATCH COMPLETE"
echo "Manual Replit restart required once because backend engine code changed."
