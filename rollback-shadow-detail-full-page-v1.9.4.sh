#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/detail-full-page-v1.9.4-20260913-210055/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/detail-full-page-v1.9.4-20260913-210055/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/detail-full-page-v1.9.4-20260913-210055/si-current.css" "/home/runner/workspace/public/si-current.css"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/detail-full-page-v1.9.4-20260913-210055"
