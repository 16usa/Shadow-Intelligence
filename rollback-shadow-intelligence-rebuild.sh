#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP="/home/runner/workspace/backups/shadow-intelligence-rebuild-20260911-042338"
for f in public/index.html public/app.js public/styles.css public/x-final.css public/network-live.js public/network-live.css; do
  if [ -f "$BACKUP/$f" ]; then mkdir -p "$ROOT/$(dirname "$f")"; cp "$BACKUP/$f" "$ROOT/$f"; else rm -f "$ROOT/$f"; fi
done
rm -f "$ROOT/public/si-graph.js" "$ROOT/public/si-shell.css"
echo "Rollback restored from $BACKUP"
