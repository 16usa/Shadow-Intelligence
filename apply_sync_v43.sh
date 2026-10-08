#!/bin/sh
set -eu
cp src/internal-copy-engine.mjs src/internal-copy-engine.mjs.bak-v43-local
python3 apply_sync_v43.py
if ! node --check src/internal-copy-engine.mjs; then
  cp src/internal-copy-engine.mjs.bak-v43-local src/internal-copy-engine.mjs
  echo 'Syntax check failed; original restored.' >&2
  exit 1
fi
echo 'V43 syntax OK. No DB or Solana transactions performed.'
