#!/bin/sh
set -eu

FILE="src/internal-copy-engine.mjs"
PATCH="sync_session_rebind_v16/internal-copy-engine.mjs"
EXPECTED="387fb9a90b0a6131dfff09475b07f76d2c4f446e07382ea5f22d83aef187dab3"
BACKUP="src/internal-copy-engine.mjs.bak-session-rebind-v16"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run this from ~/workspace."
  exit 1
fi

if grep -q 'SYNC_DELEGATED_SESSION_REBIND_V16' "$FILE"; then
  echo "SYNC DELEGATED SESSION REBIND V16 ALREADY INSTALLED"
  node --check "$FILE"
  exit 0
fi

ACTUAL="$(sha256sum "$FILE" | awk '{print $1}')"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: executor differs from the V15 version this hotfix targets."
  echo "Expected: $EXPECTED"
  echo "Actual:   $ACTUAL"
  echo "No files were changed."
  exit 2
fi

cp "$FILE" "$BACKUP"
cp "$PATCH" "$FILE"

if ! node --check "$FILE"; then
  cp "$BACKUP" "$FILE"
  echo "ERROR: syntax check failed; V15 restored."
  exit 3
fi

echo "SYNC DELEGATED SESSION REBIND V16 INSTALLED"
echo "Backup: $BACKUP"
echo "Fix: reuses the existing funded/authorized delegated session for the same user + entity + owner wallet when only subscription_id drifted."
echo "No Program ID, private keys, vault addresses, balances, or on-chain accounts were changed."
grep -n 'SYNC_DELEGATED_SESSION_REBIND_V16' "$FILE" | head -10
