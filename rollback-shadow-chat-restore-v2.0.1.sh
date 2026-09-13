#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-restore-v2.0.1-20260913-214100/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/chat-restore-v2.0.1-20260913-214100/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/chat-restore-v2.0.1-20260913-214100/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/chat-restore-v2.0.1-20260913-214100"
