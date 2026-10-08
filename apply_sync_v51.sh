#!/bin/sh
set -eu
python3 apply_sync_v51.py
node --check src/sync-vault-reclaim.mjs
printf '%s\n' 'V51 syntax OK; no deployment, DB write, or Solana transaction.'
