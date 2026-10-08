#!/bin/sh
set -eu
cd "$(dirname "$0")"
test -f src/internal-copy-engine.mjs || { echo 'Run from project root'; exit 1; }
cp src/internal-copy-engine.mjs src/internal-copy-engine.mjs.bak-v35
if ! python3 apply_sync_v35.py || ! node --check src/internal-copy-engine.mjs; then
  cp src/internal-copy-engine.mjs.bak-v35 src/internal-copy-engine.mjs
  echo 'V35 failed; original restored'
  exit 1
fi
echo 'SYNC V35 INSTALLED. Restart Replit manually.'
