#!/bin/sh
set -eu

python3 apply_sync_vault_header_live_v24.py

if ! node --check public/sync.js; then
  cp public/sync.html.bak-vault-header-v24 public/sync.html
  cp public/sync.js.bak-vault-header-v24 public/sync.js
  rm -f public/sync-vault-header.css
  echo "ERROR: sync.js syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC VAULT HEADER LIVE V24 PATCH COMPLETE"
echo "Frontend-only patch. Replit restart is optional; refresh the SYNC page after install."
