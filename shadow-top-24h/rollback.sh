#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

MARKER=".shadow-last-top-24h-backup"
if [[ ! -f "$MARKER" ]]; then
  echo "ERROR: $MARKER not found"
  exit 1
fi

BACKUP="$(cat "$MARKER")"

for f in server.mjs src/adapters/token-market.mjs public/index.html; do
  if [[ ! -f "$BACKUP/$f" ]]; then
    echo "ERROR: backup missing: $BACKUP/$f"
    exit 1
  fi
  cp "$BACKUP/$f" "$f"
done

if [[ -f "$BACKUP/.had-js" ]]; then
  cp "$BACKUP/public/si-top-movers.js" public/si-top-movers.js
else
  rm -f public/si-top-movers.js
fi

if [[ -f "$BACKUP/.had-css" ]]; then
  cp "$BACKUP/public/si-top-movers.css" public/si-top-movers.css
else
  rm -f public/si-top-movers.css
fi

echo "Rollback complete."
echo "Restored from: $BACKUP"
echo "Restart the Shadow/Replit app once."
