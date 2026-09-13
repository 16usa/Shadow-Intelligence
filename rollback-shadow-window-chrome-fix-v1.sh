#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/window-chrome-fix-v1-20260913-095713/index.html" "/home/runner/workspace/public/index.html"
if [ -f "/home/runner/workspace/.shadow-backups/window-chrome-fix-v1-20260913-095713/shadow-window-chrome-fix.js" ]; then
  cp "/home/runner/workspace/.shadow-backups/window-chrome-fix-v1-20260913-095713/shadow-window-chrome-fix.js" "/home/runner/workspace/public/shadow-window-chrome-fix.js"
else
  rm -f "/home/runner/workspace/public/shadow-window-chrome-fix.js"
fi
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/window-chrome-fix-v1-20260913-095713"
