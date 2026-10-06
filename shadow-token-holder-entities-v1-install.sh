#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: run this patch from inside the Shadow-Intelligence repository."
  exit 1
fi
cd "$ROOT"

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

case "$ORIGIN" in
  *16usa/Shadow-Intelligence*) ;;
  *) echo "ERROR: wrong repository: $ORIGIN"; exit 1 ;;
esac

[ "$BRANCH" = "main" ] || { echo "ERROR: expected main, found $BRANCH"; exit 1; }

for f in server.mjs public/app.js public/si-current.css; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 shadow-token-holder-entities-v1.py

node --check server.mjs
node --check public/app.js

grep -q "SHADOW_TOKEN_HOLDER_ENTITIES_V390_API" server.mjs
grep -q "SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP" public/app.js
grep -q "SHADOW_TOKEN_HOLDER_ENTITIES_V390_CSS" public/si-current.css

echo
echo "Shadow Token Holder Entities v1 applied successfully."
echo "Token cards now show current holding Entity avatars immediately after the token symbol."
echo "Only positive current positions are shown; historical-only links are excluded."
echo "No server restart was performed."
