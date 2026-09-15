#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

APP="public/app.js"
HTML="public/index.html"

for f in "$APP" "$HTML"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-remove-1h-label-v2.5.9-${STAMP}"
mkdir -p "$BACKUP/public"

cp "$APP" "$BACKUP/public/app.js"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-tokens-remove-1h-label-backup

python3 - <<'PY'
from pathlib import Path
import re

app_path=Path("public/app.js")
html_path=Path("public/index.html")

app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

old = """    const changeText=!known
      ? '1H —'
      : `1H ${change>=0?'+':''}${change.toFixed(1)}%`;"""

new = """    const changeText=!known
      ? '—'
      : `${change>=0?'+':''}${change.toFixed(1)}%`;"""

if old not in app:
    raise SystemExit("ERROR: current Tokens 1H label block not found")

app=app.replace(old,new,1)

html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-clean-percent-2.5.9-20260915',
    html,
    count=1
)

if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-clean-percent-2.5.9-20260915\2',
        html,
        count=1
    )

if n!=1:
    raise SystemExit("ERROR: app.js cache-buster not found")

app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Removed visible '1H' prefix from token percentages")
print("Strict 1-hour data logic remains unchanged")
print("Top 1H sorting remains unchanged")
print("Example: +503.0% instead of 1H +503.0%")
PY

node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Clean Percent v2.5.9: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
