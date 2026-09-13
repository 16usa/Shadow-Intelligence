#!/usr/bin/env bash
set -euo pipefail

cp "/home/runner/workspace/.shadow-backups/ui-consolidation-v1.5.0-20260913-154904/public/index.html" "/home/runner/workspace/public/index.html"

rm -f "/home/runner/workspace/public/si-current.css" "/home/runner/workspace/public/si-current-ui.js"

for f in "/home/runner/workspace/.shadow-backups/ui-consolidation-v1.5.0-20260913-154904"/public/*.css "/home/runner/workspace/.shadow-backups/ui-consolidation-v1.5.0-20260913-154904"/public/*.js; do
  [ -f "$f" ] && cp "$f" "/home/runner/workspace/public/$(basename "$f")"
done

echo "Rollback complete."
echo "Restored UI files from: /home/runner/workspace/.shadow-backups/ui-consolidation-v1.5.0-20260913-154904"
