#!/bin/sh
set -eu
python3 apply_sync_live_signals_v17.py
node --check server.mjs
node --check public/sync.js
echo "PATCH COMPLETE"
echo "Manual Replit restart required once."
