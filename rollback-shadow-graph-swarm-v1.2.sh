#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-swarm-v1.2-20260913-070431/index.html" "/home/runner/workspace/public/index.html"
if [ -f "/home/runner/workspace/.shadow-backups/graph-swarm-v1.2-20260913-070431/si-graph-swarm.js" ]; then
  cp "/home/runner/workspace/.shadow-backups/graph-swarm-v1.2-20260913-070431/si-graph-swarm.js" "/home/runner/workspace/public/si-graph-swarm.js"
else
  rm -f "/home/runner/workspace/public/si-graph-swarm.js"
fi
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-swarm-v1.2-20260913-070431"
