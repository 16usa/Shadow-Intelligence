#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
LATEST="$(find "$PROJECT_ROOT/.shadow-backups" -maxdepth 1 -type d -name 'profile-source-v270-*' 2>/dev/null | sort | tail -n 1)"

if [[ -z "$LATEST" ]]; then
  echo "No profile-source-v270 backup found."
  exit 1
fi

cp "$LATEST/server.mjs" "$PROJECT_ROOT/server.mjs"
cp "$LATEST/public/app.js" "$PROJECT_ROOT/public/app.js"
cp "$LATEST/src/db.mjs" "$PROJECT_ROOT/src/db.mjs"

if [[ -f "$LATEST/src/adapters/profile-avatar.mjs" ]]; then
  cp "$LATEST/src/adapters/profile-avatar.mjs" "$PROJECT_ROOT/src/adapters/profile-avatar.mjs"
else
  rm -f "$PROJECT_ROOT/src/adapters/profile-avatar.mjs"
fi

echo "Rolled back from: $LATEST"
echo "No server restart was performed."
