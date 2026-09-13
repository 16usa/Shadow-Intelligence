#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/dom-swarm-v2.0.6-20260913-223603/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/dom-swarm-v2.0.6-20260913-223603/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/dom-swarm-v2.0.6-20260913-223603/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/dom-swarm-v2.0.6-20260913-223603"
