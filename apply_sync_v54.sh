#!/bin/sh
set -eu
python3 apply_sync_v54.py
node --check src/internal-copy-engine.mjs
printf '%s\n' 'V54 syntax OK; no database or Solana transactions executed.'
