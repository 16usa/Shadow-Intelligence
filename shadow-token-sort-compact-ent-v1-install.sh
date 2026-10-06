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

for f in public/app.js public/si-current.css; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

grep -q "SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP" public/app.js || {
  echo "ERROR: Token Holder Entities patch is not present."
  exit 1
}

python3 shadow-token-sort-compact-ent-v1.py

node --check public/app.js

grep -q "data-token-ent" public/app.js
grep -q "si-token-period-menu" public/app.js
grep -q "SHADOW_TOKEN_SORT_COMPACT_ENT_V391_CSS" public/si-current.css

echo
echo "Shadow Token Sort Compact ENT v1 applied successfully."
echo "Time periods are now inside one compact popup selector."
echo "ENT sort toggles more/fewer current holding Entities with an arrow."
echo "ENT participates in the existing equal-weight joint token ranking."
echo "No server restart was performed."
