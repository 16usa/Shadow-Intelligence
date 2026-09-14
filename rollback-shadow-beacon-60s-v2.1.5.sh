#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/beacon-60s-v2.1.5-20260914-020743/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/beacon-60s-v2.1.5-20260914-020743/si-current.css" "/home/runner/workspace/public/si-current.css"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/beacon-60s-v2.1.5-20260914-020743"
