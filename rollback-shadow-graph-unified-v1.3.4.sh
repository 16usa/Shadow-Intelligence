#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-unified-v1.3.4-20260913-092738/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/graph-unified-v1.3.4-20260913-092738/si-graph.js" "/home/runner/workspace/public/si-graph.js"
rm -f "/home/runner/workspace/public/si-graph-unified-v134.js"
for n in si-graph-mobile.js si-graph-swarm.js si-graph-latest-v131.js si-graph-latest-v132.js si-graph-latest-v133.js si-graph-unified-v134.js; do
  [ -f "/home/runner/workspace/.shadow-backups/graph-unified-v1.3.4-20260913-092738/$n" ] && cp "/home/runner/workspace/.shadow-backups/graph-unified-v1.3.4-20260913-092738/$n" "/home/runner/workspace/public/$n" || true
done
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-unified-v1.3.4-20260913-092738"
