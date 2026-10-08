#!/bin/sh
set -eu
python3 apply_sync_v40_fix.py
node --check src/internal-copy-engine.mjs
printf '\nTo push (only after successful install):\n'
printf '%s\n' 'git add src/internal-copy-engine.mjs apply_sync_v40_fix.py apply_sync_v40_fix.sh README_V40_FIX.txt && (git diff --cached --quiet || git commit -m "SYNC V40 corrected policy guards") && git push origin main'
