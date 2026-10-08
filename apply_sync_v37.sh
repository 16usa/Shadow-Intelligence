#!/bin/sh
set -eu
cd "$(dirname "$0")"
cp public/sync.js public/sync.js.bak-v37
if ! python3 apply_sync_v37.py || ! node --check public/sync.js; then
  cp public/sync.js.bak-v37 public/sync.js
  echo 'V37 rolled back due to failed validation' >&2
  exit 1
fi
echo 'SYNC V37 INSTALLED. Restart Replit manually.'
