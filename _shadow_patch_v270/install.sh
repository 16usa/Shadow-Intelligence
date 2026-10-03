#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$PROJECT_ROOT/server.mjs" || ! -f "$PROJECT_ROOT/public/app.js" || ! -f "$PROJECT_ROOT/src/db.mjs" ]]; then
  echo "ERROR: Run this from the existing Shadow Intelligence Replit workspace root."
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$PROJECT_ROOT/.shadow-backups/profile-source-v270-$STAMP"
mkdir -p "$BACKUP/public" "$BACKUP/src/adapters" "$BACKUP/src"

cp "$PROJECT_ROOT/server.mjs" "$BACKUP/server.mjs"
cp "$PROJECT_ROOT/public/app.js" "$BACKUP/public/app.js"
cp "$PROJECT_ROOT/src/db.mjs" "$BACKUP/src/db.mjs"
if [[ -f "$PROJECT_ROOT/src/adapters/profile-avatar.mjs" ]]; then
  cp "$PROJECT_ROOT/src/adapters/profile-avatar.mjs" "$BACKUP/src/adapters/profile-avatar.mjs"
fi

mkdir -p "$PROJECT_ROOT/src/adapters"
cp "$SCRIPT_DIR/profile-avatar.mjs" "$PROJECT_ROOT/src/adapters/profile-avatar.mjs"

python3 "$SCRIPT_DIR/patch.py" "$PROJECT_ROOT"

echo
echo "Running syntax checks..."
node --check "$PROJECT_ROOT/server.mjs"
node --check "$PROJECT_ROOT/public/app.js"
node --check "$PROJECT_ROOT/src/adapters/profile-avatar.mjs"

echo
echo "Running project tests..."
(
  cd "$PROJECT_ROOT"
  npm test
)

echo
echo "PATCH INSTALLED SUCCESSFULLY"
echo "Backup: $BACKUP"
echo "No server restart was performed."
echo
echo "Next, push when ready:"
echo "  git add server.mjs public/app.js src/db.mjs src/adapters/profile-avatar.mjs"
echo "  git commit -m 'Add universal entity profiles and duplicate wallet check'"
echo "  git push"
