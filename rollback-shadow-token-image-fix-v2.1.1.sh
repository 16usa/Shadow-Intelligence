#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/token-image-fix-v2.1.1-20260914-012149/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/token-image-fix-v2.1.1-20260914-012149/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/token-image-fix-v2.1.1-20260914-012149"
