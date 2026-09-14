#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/remove-3d-hud-v2.0.9-20260913-231104/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/remove-3d-hud-v2.0.9-20260913-231104/si-graph.js" "/home/runner/workspace/public/si-graph.js"
cp "/home/runner/workspace/.shadow-backups/remove-3d-hud-v2.0.9-20260913-231104/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/remove-3d-hud-v2.0.9-20260913-231104"
