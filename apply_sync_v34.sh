#!/bin/sh
set -eu
cd "$(dirname "$0")"
cp src/internal-copy-engine.mjs src/internal-copy-engine.mjs.bak-v34
python3 apply_sync_v34.py || { cp src/internal-copy-engine.mjs.bak-v34 src/internal-copy-engine.mjs; exit 1; }
node --check src/internal-copy-engine.mjs || { cp src/internal-copy-engine.mjs.bak-v34 src/internal-copy-engine.mjs; exit 1; }
echo 'V34 installed; restart manually.'
