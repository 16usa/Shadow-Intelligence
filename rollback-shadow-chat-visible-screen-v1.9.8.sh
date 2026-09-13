#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-visible-screen-v1.9.8-20260913-211421/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/chat-visible-screen-v1.9.8-20260913-211421/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/chat-visible-screen-v1.9.8-20260913-211421"
