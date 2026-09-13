#!/usr/bin/env bash
set -euo pipefail

cp "/home/runner/workspace/.shadow-backups/graph-soft-contact-v1.3.6-20260913-093525/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/graph-soft-contact-v1.3.6-20260913-093525/si-graph.js" "/home/runner/workspace/public/si-graph.js"
rm -f "/home/runner/workspace/public/si-graph-unified-v136.js"

for n in   si-graph-mobile.js   si-graph-swarm.js   si-graph-latest-v131.js   si-graph-latest-v132.js   si-graph-latest-v133.js   si-graph-unified-v134.js   si-graph-unified-v135.js   si-graph-unified-v136.js
do
  [ -f "/home/runner/workspace/.shadow-backups/graph-soft-contact-v1.3.6-20260913-093525/$n" ] && cp "/home/runner/workspace/.shadow-backups/graph-soft-contact-v1.3.6-20260913-093525/$n" "/home/runner/workspace/public/$n" || true
done

echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-soft-contact-v1.3.6-20260913-093525"
