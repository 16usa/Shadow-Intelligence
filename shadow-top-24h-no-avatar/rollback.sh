#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

MARKER=".shadow-last-top-24h-no-avatar-backup"
[[ -f "$MARKER" ]] || { echo "ERROR: backup marker not found"; exit 1; }

BACKUP="$(cat "$MARKER")"
cp "$BACKUP/public/si-top-movers.js" public/si-top-movers.js
cp "$BACKUP/public/si-top-movers.css" public/si-top-movers.css
cp "$BACKUP/public/index.html" public/index.html

echo "Rollback complete. Refresh Safari."
