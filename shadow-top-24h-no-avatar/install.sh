#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

JS="public/si-top-movers.js"
CSS="public/si-top-movers.css"
HTML="public/index.html"
VERSION="v2.5.3"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/top-24h-no-avatar-${VERSION}-${STAMP}"

for f in "$JS" "$CSS" "$HTML"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: Top 24H Movers must already be installed. Missing: $f"
    exit 1
  fi
done

mkdir -p "$BACKUP/public"
cp "$JS" "$BACKUP/public/si-top-movers.js"
cp "$CSS" "$BACKUP/public/si-top-movers.css"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-top-24h-no-avatar-backup

cp "$(dirname "$0")/si-top-movers.js" "$JS"
cp "$(dirname "$0")/si-top-movers.css" "$CSS"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

html,n1=re.subn(
    r'(/si-top-movers\.css\?v=)[^"\']+',
    r'\g<1>2.5.3-20260915',
    html,
    count=1
)
html,n2=re.subn(
    r'(/si-top-movers\.js\?v=)[^"\']+',
    r'\g<1>2.5.3-20260915',
    html,
    count=1
)

if n1!=1 or n2!=1:
    raise SystemExit(f"ERROR: mover asset cache-busters not found correctly (css={n1}, js={n2})")

p.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Removed token avatars/images from 24H Movers")
print("Cards now show: ticker + market cap + 24H % + sparkline")
print("Strongest 24H mover remains nearest to the bell")
PY

node --check public/si-top-movers.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Top 24H no-avatar ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required. Refresh Safari."
echo
echo "Rollback:"
echo "  bash shadow-top-24h-no-avatar/rollback.sh"
