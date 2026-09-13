#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-soft-repulsion-v1.3.3-20260913-091746/index.html" "/home/runner/workspace/public/index.html"
rm -f "/home/runner/workspace/public/si-graph-latest-v133.js"
for n in si-graph.js si-graph-mobile.js si-graph-swarm.js si-graph-latest-v131.js si-graph-latest-v132.js si-graph-latest-v133.js; do
  [ -f "/home/runner/workspace/.shadow-backups/graph-soft-repulsion-v1.3.3-20260913-091746/$n" ] && cp "/home/runner/workspace/.shadow-backups/graph-soft-repulsion-v1.3.3-20260913-091746/$n" "/home/runner/workspace/public/$n" || true
done
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-soft-repulsion-v1.3.3-20260913-091746"
