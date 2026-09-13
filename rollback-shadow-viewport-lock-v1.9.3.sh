#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.3-20260913-205618/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.3-20260913-205618/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.3-20260913-205618/si-current.css" "/home/runner/workspace/public/si-current.css"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/viewport-lock-v1.9.3-20260913-205618"
