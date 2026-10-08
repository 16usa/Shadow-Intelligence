#!/bin/sh
set -eu
python3 apply_sync_v55.py
node --check src/sync-vault-reclaim.mjs
printf 'V55 syntax OK. Installer made no DB writes or Solana transactions.\n'
