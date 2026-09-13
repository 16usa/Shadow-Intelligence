#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.2-20260913-205332/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.2-20260913-205332/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/viewport-lock-v1.9.2-20260913-205332/si-current.css" "/home/runner/workspace/public/si-current.css"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/viewport-lock-v1.9.2-20260913-205332"
