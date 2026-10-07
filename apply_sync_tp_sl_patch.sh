#!/bin/sh
set -e
python3 sync_tp_sl_patch.py
node --check public/sync.js
echo
echo "Patch complete. Review with:"
echo "git diff -- public/sync.html public/sync.js"
