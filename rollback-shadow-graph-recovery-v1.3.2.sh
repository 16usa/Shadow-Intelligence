#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-recovery-v1.3.2-20260913-083518/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/graph-recovery-v1.3.2-20260913-083518/si-graph.js" "/home/runner/workspace/public/si-graph.js"
rm -f "/home/runner/workspace/public/si-graph-latest-v132.js"
for n in si-graph-mobile.js si-graph-swarm.js si-graph-latest-v131.js si-graph-latest-v132.js; do
  [ -f "/home/runner/workspace/.shadow-backups/graph-recovery-v1.3.2-20260913-083518/$n" ] && cp "/home/runner/workspace/.shadow-backups/graph-recovery-v1.3.2-20260913-083518/$n" "/home/runner/workspace/public/$n" || true
done
echo "Rollback complete from /home/runner/workspace/.shadow-backups/graph-recovery-v1.3.2-20260913-083518"
