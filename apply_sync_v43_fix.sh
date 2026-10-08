#!/bin/sh
set -eu
python3 apply_sync_v43_fix.py
node --check src/internal-copy-engine.mjs
printf 'V43 FIX syntax OK\n'
