#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

B="$(cat .shadow-last-search-scope-fix-backup)"
cp "$B/public/index.html" public/index.html

if [[ -f "$B/.had-js" ]]; then
  cp "$B/public/si-search-scope-fix.js" public/si-search-scope-fix.js
else
  rm -f public/si-search-scope-fix.js
fi

if [[ -f "$B/.had-css" ]]; then
  cp "$B/public/si-search-scope-fix.css" public/si-search-scope-fix.css
else
  rm -f public/si-search-scope-fix.css
fi

echo "Rollback complete. Refresh Safari."
