#!/bin/sh
set -eu

python3 apply_sync_auth_continue_v23.py

if ! node --check public/execution-authorize.js; then
  cp public/execution-authorize.html.bak-auth-continue-v23 public/execution-authorize.html
  cp public/execution-authorize.js.bak-auth-continue-v23 public/execution-authorize.js
  echo "ERROR: JS syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC AUTH CONTINUE V23 PATCH COMPLETE"
echo "Frontend-only patch. Replit restart is optional; refresh the page after install."
