#!/bin/sh
set -eu
cd "$(dirname "$0")"
cp public/sync.js public/sync.js.bak-v36
if ! python3 apply_sync_v36.py || ! node --check public/sync.js; then
  cp public/sync.js.bak-v36 public/sync.js
  echo 'V36 rolled back' >&2
  exit 1
fi
echo 'SYNC V36 INSTALLED. Restart Replit manually.'
