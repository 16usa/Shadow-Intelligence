#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "/home/runner/workspace/backups/shadow-intelligence-map-fix-v2-20260911-043626/public/si-graph.js" ]; then cp "/home/runner/workspace/backups/shadow-intelligence-map-fix-v2-20260911-043626/public/si-graph.js" "/home/runner/workspace/public/si-graph.js"; fi
echo "Rollback complete."
