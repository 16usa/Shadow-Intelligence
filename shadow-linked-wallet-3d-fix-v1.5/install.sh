#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.shadow-linked-wallet-3d-v1.5-backup-$STAMP"

for f in public/app.js package.json; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "ERROR: run this from the existing Shadow project workspace. Missing: $f"
    exit 1
  fi
done

# v1.5 expects the v1.4 linked-wallet payload/search patch to be present.
if ! grep -q "linkedWallets" "$ROOT/public/app.js"; then
  echo "ERROR: linked-wallet v1.4 is not detected in public/app.js. Install v1.4 first."
  exit 1
fi

mkdir -p "$BACKUP/public"
cp "$ROOT/public/app.js" "$BACKUP/public/app.js"

echo "Backup: ${BACKUP#$ROOT/}"

restore_original(){
  cp "$BACKUP/public/app.js" "$ROOT/public/app.js"
}

if ! python3 "$PATCH_DIR/apply_patch.py"; then
  echo "Patch application failed. Restoring public/app.js..."
  restore_original
  exit 1
fi

if ! node --check public/app.js; then
  echo "Syntax check failed. Restoring public/app.js..."
  restore_original
  exit 1
fi

if ! npm test; then
  echo "Tests failed. Restoring public/app.js..."
  restore_original
  exit 1
fi

echo
echo "SUCCESS: linked-wallet 3D fix v1.5 installed."
echo "3D entity detail now merges entity.linkedWallets + detail wallets, deduplicated by address."
echo "No server restart was performed. Restart manually from Replit when ready."
echo "Backup kept at: ${BACKUP#$ROOT/}"
echo
echo "Changed file:"
git diff -- public/app.js || true
