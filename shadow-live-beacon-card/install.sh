#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

JS="public/si-top-movers.js"
CSS="public/si-top-movers.css"
HTML="public/index.html"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/live-beacon-card-v2.5.6-${STAMP}"

for f in "$JS" "$CSS" "$HTML"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

mkdir -p "$BACKUP/public"
cp "$JS" "$BACKUP/public/si-top-movers.js"
cp "$CSS" "$BACKUP/public/si-top-movers.css"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-live-beacon-card-backup

cp "$(dirname "$0")/si-top-movers.js" "$JS"
cp "$(dirname "$0")/si-top-movers.css" "$CSS"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

html,n1=re.subn(
    r'(/si-top-movers\.css\?v=)[^"\']+',
    r'\g<1>2.5.6-20260915',
    html,
    count=1
)
html,n2=re.subn(
    r'(/si-top-movers\.js\?v=)[^"\']+',
    r'\g<1>2.5.6-20260915',
    html,
    count=1
)

if n1!=1 or n2!=1:
    raise SystemExit(f"ERROR: mover asset tags not found (css={n1}, js={n2})")

p.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Replaced market mover card with latest Live Activity card")
print("Source: existing /api/feed stream")
print("Shows latest BUY / SELL / SWAP event")
print("Refresh: every 15 seconds")
print("Tap card: opens Live Activity")
print("No backend change; no server restart required")
PY

node --check public/si-top-movers.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Live Activity Beacon Card v2.5.6: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required. Refresh Safari."
