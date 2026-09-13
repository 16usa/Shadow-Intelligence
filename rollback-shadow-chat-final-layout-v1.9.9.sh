#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-final-layout-v1.9.9-20260913-213117/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/chat-final-layout-v1.9.9-20260913-213117/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/chat-final-layout-v1.9.9-20260913-213117/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/chat-final-layout-v1.9.9-20260913-213117"
