#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-mobile-v1.1.1-20260913-070003/index.html" "/home/runner/workspace/public/index.html"
if [ -f "/home/runner/workspace/.shadow-backups/graph-mobile-v1.1.1-20260913-070003/si-graph-mobile.js" ]; then
  cp "/home/runner/workspace/.shadow-backups/graph-mobile-v1.1.1-20260913-070003/si-graph-mobile.js" "/home/runner/workspace/public/si-graph-mobile.js"
else
  rm -f "/home/runner/workspace/public/si-graph-mobile.js"
fi
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-mobile-v1.1.1-20260913-070003"
