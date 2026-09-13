#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/full-page-navigation-v1.9.0-20260913-204420/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/full-page-navigation-v1.9.0-20260913-204420/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/full-page-navigation-v1.9.0-20260913-204420/si-current.css" "/home/runner/workspace/public/si-current.css"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/full-page-navigation-v1.9.0-20260913-204420"
