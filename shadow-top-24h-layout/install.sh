#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

CSS="public/si-top-movers.css"
HTML="public/index.html"
VERSION="v2.5.1"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/top-24h-layout-${VERSION}-${STAMP}"

if [[ ! -f "$CSS" || ! -f "$HTML" ]]; then
  echo "ERROR: Top 24H Movers v2.5.0 must be installed first."
  exit 1
fi

mkdir -p "$BACKUP/public"
cp "$CSS" "$BACKUP/public/si-top-movers.css"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-top-24h-layout-backup

cp "$(dirname "$0")/si-top-movers.css" "$CSS"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

html, n = re.subn(
    r'(/si-top-movers\.css\?v=)[^"\']+',
    r'\g<1>2.5.1-20260914',
    html,
    count=1
)
if n != 1:
    raise SystemExit("ERROR: si-top-movers.css cache-buster not found")

p.write_text(html,encoding="utf-8")
print("PATCH: PASS")
print("Moved 24H Movers lower")
print("Feed now originates from the bell/right side")
print("Card height reduced to 62px")
print("Card width reduced to 244px")
PY

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Top 24H layout ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "No server restart is required."
echo "Just refresh Safari."
echo
echo "Rollback:"
echo "  bash shadow-top-24h-layout/rollback.sh"
