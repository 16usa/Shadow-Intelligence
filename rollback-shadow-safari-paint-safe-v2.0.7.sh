#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/safari-paint-safe-v2.0.7-20260913-225354/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/safari-paint-safe-v2.0.7-20260913-225354/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/safari-paint-safe-v2.0.7-20260913-225354/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/safari-paint-safe-v2.0.7-20260913-225354"
