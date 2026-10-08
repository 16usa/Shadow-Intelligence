#!/bin/sh
set -eu

python3 apply_sync_auth_flow_stable_v29.py

ok=1
node --check src/internal-copy-engine.mjs || ok=0
node --check server.mjs || ok=0
node --check public/execution-authorize.js || ok=0

if [ "$ok" -ne 1 ]; then
  cp src/internal-copy-engine.mjs.bak-auth-flow-v29 src/internal-copy-engine.mjs
  cp server.mjs.bak-auth-flow-v29 server.mjs
  cp public/execution-authorize.js.bak-auth-flow-v29 public/execution-authorize.js
  echo "ERROR: syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC AUTH FLOW STABLE V29 PATCH COMPLETE"
echo "Manual Replit restart required once."
