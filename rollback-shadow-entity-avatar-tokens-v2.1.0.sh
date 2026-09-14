#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/entity-avatar-tokens-v2.1.0-20260914-003025/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/entity-avatar-tokens-v2.1.0-20260914-003025/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/entity-avatar-tokens-v2.1.0-20260914-003025/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/entity-avatar-tokens-v2.1.0-20260914-003025"
