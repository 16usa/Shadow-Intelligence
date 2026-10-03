#!/usr/bin/env bash
set -euo pipefail

PATCH_NAME="Shadow-Linked-Wallet-Search-Fix-v1.1"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-linked-wallet-search-backup-${STAMP}"

for f in server.mjs public/app.js tests/smoke.test.mjs; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: run this from the existing Shadow project workspace. Missing: $f"
    exit 1
  fi
done

mkdir -p "$BACKUP/public" "$BACKUP/tests"
cp server.mjs "$BACKUP/server.mjs"
cp public/app.js "$BACKUP/public/app.js"
cp tests/smoke.test.mjs "$BACKUP/tests/smoke.test.mjs"

echo "Backup: $BACKUP"

restore() {
  cp "$BACKUP/server.mjs" server.mjs
  cp "$BACKUP/public/app.js" public/app.js
  cp "$BACKUP/tests/smoke.test.mjs" tests/smoke.test.mjs
}

if ! python3 shadow-linked-wallet-fix-v1.1/apply_patch.py; then
  echo "Patch apply failed. Restoring original files..."
  restore
  exit 1
fi

echo "Checking diff..."
git diff --check -- server.mjs public/app.js tests/smoke.test.mjs

echo "Running tests..."
if ! npm test; then
  echo "Patch/test failed. Restoring original files..."
  restore
  exit 1
fi

echo
echo "PASS: linked-wallet search patch installed successfully."
echo "Backup kept at: $BACKUP"
echo "No server restart was performed. Restart manually from Replit when ready."
echo
echo "Push when ready:"
echo "  git add server.mjs public/app.js tests/smoke.test.mjs"
echo "  git commit -m \"Fix linked wallet search and async DB shutdown race\""
echo "  git push origin main"
