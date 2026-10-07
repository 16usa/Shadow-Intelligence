#!/bin/sh
set -eu

python3 apply_sync_copy_state_ui_v20b.py

if ! node --check public/sync.js; then
  cp public/sync.js.bak-copy-state-v20b public/sync.js
  echo "ERROR: syntax check failed; original public/sync.js restored."
  exit 1
fi

echo
echo "SYNC COPY STATE UI V20B PATCH COMPLETE"
echo "Manual Replit restart recommended once."
