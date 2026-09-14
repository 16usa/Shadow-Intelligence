#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/live-activity-links-v2.1.8-20260914-031125/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/live-activity-links-v2.1.8-20260914-031125/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/live-activity-links-v2.1.8-20260914-031125/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/live-activity-links-v2.1.8-20260914-031125/server.mjs" "/home/runner/workspace/server.mjs"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/live-activity-links-v2.1.8-20260914-031125"
