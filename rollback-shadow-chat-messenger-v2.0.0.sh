#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-messenger-v2.0.0-20260913-213535/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/chat-messenger-v2.0.0-20260913-213535/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/chat-messenger-v2.0.0-20260913-213535/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/chat-messenger-v2.0.0-20260913-213535"
