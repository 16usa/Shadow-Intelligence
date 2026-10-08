#!/bin/sh
set -eu
python3 apply_sync_v40.py
node --check src/internal-copy-engine.mjs
printf '%s\n' 'V40 checks passed. Restart manually when ready.'
