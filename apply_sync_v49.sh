#!/bin/sh
set -eu
python3 apply_sync_v49.py
node --check src/internal-copy-engine.mjs
printf '\nV49 syntax OK. No DB changes, no Solana transactions.\n'
printf 'Pushing changed files...\n'
git add src/internal-copy-engine.mjs apply_sync_v49.py apply_sync_v49.sh README_V49.txt
if ! git diff --cached --quiet; then git commit -m 'SYNC V49 verify on-chain authorization identity'; fi
git push origin main
