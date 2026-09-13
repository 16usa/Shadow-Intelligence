#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/static-swarm-v1.3-20260913-080211/index.html" "/home/runner/workspace/public/index.html"
if [ -f "/home/runner/workspace/.shadow-backups/static-swarm-v1.3-20260913-080211/si-graph-swarm.js" ]; then cp "/home/runner/workspace/.shadow-backups/static-swarm-v1.3-20260913-080211/si-graph-swarm.js" "/home/runner/workspace/public/si-graph-swarm.js"; else rm -f "/home/runner/workspace/public/si-graph-swarm.js"; fi
echo "Rollback complete. Restored from: /home/runner/workspace/.shadow-backups/static-swarm-v1.3-20260913-080211"
