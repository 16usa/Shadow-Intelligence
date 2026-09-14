#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/open-object-v2.0.7.1-20260913-225747/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/open-object-v2.0.7.1-20260913-225747/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/open-object-v2.0.7.1-20260913-225747"
