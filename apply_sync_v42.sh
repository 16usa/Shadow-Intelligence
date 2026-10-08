#!/bin/sh
set -eu
python3 apply_sync_v42.py
node --check src/internal-copy-engine.mjs
printf '\nV42 syntax OK. No DB or Solana transactions performed.\n'
