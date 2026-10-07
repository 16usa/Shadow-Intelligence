#!/bin/sh
set -eu

python3 apply_sync_auth_token_race_fix_v28.py

if ! node --check src/internal-copy-engine.mjs; then
  cp src/internal-copy-engine.mjs.bak-auth-token-v28 src/internal-copy-engine.mjs
  echo "ERROR: engine syntax check failed; original restored."
  exit 1
fi

echo
echo "SYNC AUTH TOKEN RACE FIX V28 PATCH COMPLETE"
echo "Manual Replit restart required once."
