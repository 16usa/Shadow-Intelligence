#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/chat-canonical-v2.0.2-20260913-214957/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/chat-canonical-v2.0.2-20260913-214957/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/chat-canonical-v2.0.2-20260913-214957/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/chat-canonical-v2.0.2-20260913-214957/db.mjs" "/home/runner/workspace/src/db.mjs"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/chat-canonical-v2.0.2-20260913-214957"
