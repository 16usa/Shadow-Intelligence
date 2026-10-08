#!/bin/sh
set -eu
python3 apply_sync_v50.py
node --check src/sync-vault-reclaim.mjs
printf 'V50 syntax OK. No database writes or Solana transactions performed by installer.\n'
git add src/sync-vault-reclaim.mjs apply_sync_v50.py apply_sync_v50.sh README_V50.txt
if ! git diff --cached --quiet; then git commit -m 'SYNC V50 verify owner revoke before local session release'; fi
git push origin main
