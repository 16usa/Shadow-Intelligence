#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

CSS="public/si-top-movers.css"
HTML="public/index.html"
VERSION="v2.5.2"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/top-24h-bell-row-${VERSION}-${STAMP}"

if [[ ! -f "$CSS" || ! -f "$HTML" ]]; then
  echo "ERROR: Top 24H Movers must already be installed."
  exit 1
fi

mkdir -p "$BACKUP/public"
cp "$CSS" "$BACKUP/public/si-top-movers.css"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-top-24h-bell-row-backup

cp "$(dirname "$0")/si-top-movers.css" "$CSS"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")
html,n=re.subn(
    r'(/si-top-movers\.css\?v=)[^"\']+',
    r'\g<1>2.5.2-20260914',
    html,
    count=1
)
if n!=1:
    raise SystemExit("ERROR: si-top-movers.css cache-buster not found")
p.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("24H Movers aligned on the same row as the bell")
print("Bell remains visible on the far right")
print("Mover cards are now 50px high — same as the bell button")
print("Strip scrolls out from the bell/right side")
PY

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Top 24H bell-row ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required. Refresh Safari."
