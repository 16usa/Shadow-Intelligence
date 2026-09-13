#!/usr/bin/env bash
set -euo pipefail

cp "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/index.html" "/home/runner/workspace/public/index.html"

if [ -f "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/si-interaction-recovery.css" ]; then
  cp "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/si-interaction-recovery.css" "/home/runner/workspace/public/si-interaction-recovery.css"
else
  rm -f "/home/runner/workspace/public/si-interaction-recovery.css"
fi

if [ -f "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/si-interaction-recovery.js" ]; then
  cp "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/si-interaction-recovery.js" "/home/runner/workspace/public/si-interaction-recovery.js"
else
  rm -f "/home/runner/workspace/public/si-interaction-recovery.js"
fi

if [ -f "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/shadow-window-chrome-fix.js" ]; then
  cp "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456/shadow-window-chrome-fix.js" "/home/runner/workspace/public/shadow-window-chrome-fix.js"
fi

for f in "/home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456"/si-graph-*.js; do
  [ -f "$f" ] && cp "$f" "/home/runner/workspace/public/$(basename "$f")"
done

echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/interaction-recovery-v1.4.0-20260913-154456"
