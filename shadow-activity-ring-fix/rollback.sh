#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

B="$(cat .shadow-last-activity-ring-fix-backup)"
cp "$B/public/index.html" public/index.html

if [[ -f "$B/.had-js" ]]; then
  cp "$B/public/si-activity-ring-fix.js" public/si-activity-ring-fix.js
else
  rm -f public/si-activity-ring-fix.js
fi

if [[ -f "$B/.had-css" ]]; then
  cp "$B/public/si-activity-ring-fix.css" public/si-activity-ring-fix.css
else
  rm -f public/si-activity-ring-fix.css
fi

echo "Rollback complete. Refresh Safari."
