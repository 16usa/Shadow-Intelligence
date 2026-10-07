#!/bin/sh
set -eu

python3 apply_sync_vault_header_live_v24b.py

if ! node --check public/sync.js; then
  cp public/sync.js.bak-vault-header-v24b public/sync.js
  cp public/sync.css.bak-vault-header-v24b public/sync.css
  echo "ERROR: sync.js syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC VAULT HEADER LIVE V24B PATCH COMPLETE"
echo "Refresh the SYNC page. Replit restart is not required."
