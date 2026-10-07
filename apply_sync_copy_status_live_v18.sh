#!/bin/sh
set -eu
python3 apply_sync_copy_status_live_v18.py
node --check server.mjs
node --check src/internal-copy-engine.mjs
node --check public/sync.js
echo
echo "SYNC COPY STATUS LIVE V18 PATCH COMPLETE"
echo "Manual Replit restart required once."
