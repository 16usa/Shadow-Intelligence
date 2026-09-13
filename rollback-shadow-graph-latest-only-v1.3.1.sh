#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/index.html" "/home/runner/workspace/public/index.html"
rm -f "/home/runner/workspace/public/si-graph-latest-v131.js"
[ -f "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-latest-v131.js" ] && cp "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-latest-v131.js" "/home/runner/workspace/public/si-graph-latest-v131.js" || true
[ -f "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-mobile.js" ] && cp "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-mobile.js" "/home/runner/workspace/public/si-graph-mobile.js" || true
[ -f "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-swarm.js" ] && cp "/home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452/si-graph-swarm.js" "/home/runner/workspace/public/si-graph-swarm.js" || true
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-latest-only-v1.3.1-20260913-082452"
