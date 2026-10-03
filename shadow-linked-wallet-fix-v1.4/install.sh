#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.shadow-linked-wallet-search-v1.4-backup-$STAMP"

for f in server.mjs public/app.js tests/smoke.test.mjs package.json; do
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "ERROR: run this from the existing Shadow project workspace. Missing: $f"
    exit 1
  fi
done

mkdir -p "$BACKUP/public" "$BACKUP/tests"
cp "$ROOT/server.mjs" "$BACKUP/server.mjs"
cp "$ROOT/public/app.js" "$BACKUP/public/app.js"
cp "$ROOT/tests/smoke.test.mjs" "$BACKUP/tests/smoke.test.mjs"

echo "Backup: ${BACKUP#$ROOT/}"

restore_originals(){
  cp "$BACKUP/server.mjs" "$ROOT/server.mjs"
  cp "$BACKUP/public/app.js" "$ROOT/public/app.js"
  cp "$BACKUP/tests/smoke.test.mjs" "$ROOT/tests/smoke.test.mjs"
}

if ! python3 "$PATCH_DIR/apply_patch.py"; then
  echo "Patch application failed. Restoring original files..."
  restore_originals
  exit 1
fi

if ! node --check server.mjs || ! node --check public/app.js || ! node --check tests/smoke.test.mjs; then
  echo "Syntax check failed. Restoring original files..."
  restore_originals
  exit 1
fi

if ! npm test; then
  echo "Patch/test failed. Restoring original files..."
  restore_originals
  exit 1
fi

echo
echo "SUCCESS: linked-wallet search v1.4 installed."
echo "Expected test result: 11 pass / 0 fail."
echo "No server restart was performed. Restart manually from Replit when ready."
echo "Backup kept at: ${BACKUP#$ROOT/}"
echo
echo "Changed files:"
git diff -- server.mjs public/app.js tests/smoke.test.mjs || true
