#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/instant-entity-open-v2.0.8-20260913-230413/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/instant-entity-open-v2.0.8-20260913-230413/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/instant-entity-open-v2.0.8-20260913-230413"
