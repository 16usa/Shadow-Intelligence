#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/beacon-60s-v2.1.6-20260914-020940/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/beacon-60s-v2.1.6-20260914-020940/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/beacon-60s-v2.1.6-20260914-020940/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/beacon-60s-v2.1.6-20260914-020940"
