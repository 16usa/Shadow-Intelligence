#!/bin/sh
set -e
python3 sync_tp_sl_backend_patch.py
node --check server.mjs
node --check src/db.mjs
node --check src/internal-copy-engine.mjs
echo
echo "Backend TP/SL settings patch complete."
echo "Review: git diff -- server.mjs src/db.mjs src/internal-copy-engine.mjs"
