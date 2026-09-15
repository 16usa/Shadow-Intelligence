#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

JS="public/si-top-movers.js"
HTML="public/index.html"
VERSION="v2.5.4"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/top-24h-no-mc-label-${VERSION}-${STAMP}"

for f in "$JS" "$HTML"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: missing required file: $f"
    exit 1
  fi
done

mkdir -p "$BACKUP/public"
cp "$JS" "$BACKUP/public/si-top-movers.js"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-top-24h-no-mc-label-backup

python3 - <<'PY'
from pathlib import Path
import re

js_path = Path("public/si-top-movers.js")
html_path = Path("public/index.html")

js = js_path.read_text(encoding="utf-8")

old = 'MC ${escapeHtml(compactMoney(item.marketCap))}'
new = '${escapeHtml(compactMoney(item.marketCap))}'

if old not in js:
    raise SystemExit("ERROR: MC label pattern not found in si-top-movers.js")

js = js.replace(old, new, 1)
js_path.write_text(js, encoding="utf-8")

html = html_path.read_text(encoding="utf-8")
html, n = re.subn(
    r'(/si-top-movers\.js\?v=)[^"\']+',
    r'\g<1>2.5.4-20260915',
    html,
    count=1
)

if n != 1:
    raise SystemExit("ERROR: si-top-movers.js cache-buster not found")

html_path.write_text(html, encoding="utf-8")

print("PATCH: PASS")
print("Removed only the 'MC' label")
print("Market cap value remains visible, e.g. $8.2M")
PY

node --check public/si-top-movers.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Top 24H no-MC-label ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required. Refresh Safari."
