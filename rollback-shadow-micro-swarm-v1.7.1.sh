#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/micro-swarm-v1.7.1-20260913-161529/si-current-ui.js" "/home/runner/workspace/public/si-current-ui.js"
cp "/home/runner/workspace/.shadow-backups/micro-swarm-v1.7.1-20260913-161529/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/micro-swarm-v1.7.1-20260913-161529"
