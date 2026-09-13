#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/graph-boot-recovery-v2.0.4-20260913-221305/app.js" "/home/runner/workspace/public/app.js"
cp "/home/runner/workspace/.shadow-backups/graph-boot-recovery-v2.0.4-20260913-221305/index.html" "/home/runner/workspace/public/index.html"
cp "/home/runner/workspace/.shadow-backups/graph-boot-recovery-v2.0.4-20260913-221305/si-current.css" "/home/runner/workspace/public/si-current.css"
cp "/home/runner/workspace/.shadow-backups/graph-boot-recovery-v2.0.4-20260913-221305/si-graph.js" "/home/runner/workspace/public/si-graph.js"
echo "Rollback complete."
echo "Restored from: /home/runner/workspace/.shadow-backups/graph-boot-recovery-v2.0.4-20260913-221305"
