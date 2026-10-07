#!/bin/sh
set -eu
python3 apply_sync_leader_helius_refresh_v19.py
if ! node --check server.mjs; then
  cp server.mjs.bak-leader-helius-v19 server.mjs
  echo "ERROR: syntax check failed; original server.mjs restored."
  exit 1
fi
echo
echo "SYNC LEADER HELIUS REFRESH V19 PATCH COMPLETE"
echo "Manual Replit restart required once."
