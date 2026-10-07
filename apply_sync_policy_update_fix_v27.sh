#!/bin/sh
set -eu

python3 apply_sync_policy_update_fix_v27.py

if ! node --check src/internal-copy-engine.mjs; then
  cp src/internal-copy-engine.mjs.bak-policy-update-v27 src/internal-copy-engine.mjs
  echo "ERROR: engine syntax check failed; original restored."
  exit 1
fi

echo
echo "SYNC POLICY UPDATE FIX V27 PATCH COMPLETE"
echo "Manual Replit restart required once."
