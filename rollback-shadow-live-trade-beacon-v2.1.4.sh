#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/live-trade-beacon-v2.1.4-20260914-020138/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/live-trade-beacon-v2.1.4-20260914-020138/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/live-trade-beacon-v2.1.4-20260914-020138/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/live-trade-beacon-v2.1.4-20260914-020138"
