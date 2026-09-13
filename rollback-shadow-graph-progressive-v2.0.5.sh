#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-progressive-v2.0.5-20260913-222438/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/graph-progressive-v2.0.5-20260913-222438/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/graph-progressive-v2.0.5-20260913-222438/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/graph-progressive-v2.0.5-20260913-222438/si-graph.js" "/home/runner/workspace/public/si-graph.js"
echo "Rollback complete."
