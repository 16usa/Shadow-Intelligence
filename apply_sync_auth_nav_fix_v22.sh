#!/bin/sh
set -eu

python3 apply_sync_auth_nav_fix_v22.py

if ! node --check public/execution-authorize.js; then
  cp public/execution-authorize.html.bak-auth-nav-v22 public/execution-authorize.html
  cp public/execution-authorize.js.bak-auth-nav-v22 public/execution-authorize.js
  echo "ERROR: JS syntax check failed; originals restored."
  exit 1
fi

echo
echo "SYNC AUTH NAV FIX V22 PATCH COMPLETE"
echo "This is frontend-only. Replit restart is optional; refresh the page after install."
