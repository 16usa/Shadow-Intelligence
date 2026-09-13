#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-instant-send-v2.0.3-20260913-215542/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/chat-instant-send-v2.0.3-20260913-215542/server.mjs" "/home/runner/workspace/server.mjs"
cp "/home/runner/workspace/.shadow-backups/chat-instant-send-v2.0.3-20260913-215542/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
