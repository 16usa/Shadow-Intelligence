#!/usr/bin/env bash
set -euo pipefail
cp "/home/runner/workspace/.shadow-backups/token-metadata-v2.1.2-20260914-014051/token-market.mjs" "/home/runner/workspace/src/adapters/token-market.mjs"
cp "/home/runner/workspace/.shadow-backups/token-metadata-v2.1.2-20260914-014051/server.mjs" "/home/runner/workspace/server.mjs"
cp "/home/runner/workspace/.shadow-backups/token-metadata-v2.1.2-20260914-014051/index.html" "/home/runner/workspace/public/index.html"
echo "Rollback complete."
