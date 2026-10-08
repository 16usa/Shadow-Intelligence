#!/bin/sh
set -eu
python3 apply_sync_v45.py
node --check src/sync-vault-reclaim.mjs
echo "V45 syntax OK; no DB changes or Solana transactions"
