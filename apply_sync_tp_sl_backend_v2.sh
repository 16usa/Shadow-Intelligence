#!/bin/sh
set -e
python3 sync_tp_sl_backend_v2.py
node --check server.mjs
node --check src/db.mjs
node --check src/internal-copy-engine.mjs
echo "PATCH COMPLETE"
