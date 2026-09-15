#!/usr/bin/env bash
set -euo pipefail

cd "${1:-$HOME/workspace}"

for f in public/index.html public/app.js; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/search-scope-fix-v2.7.2-${STAMP}"
mkdir -p "$BACKUP/public"

cp public/index.html "$BACKUP/public/index.html"

if [[ -f public/si-search-scope-fix.js ]]; then
  cp public/si-search-scope-fix.js "$BACKUP/public/si-search-scope-fix.js"
  touch "$BACKUP/.had-js"
fi

if [[ -f public/si-search-scope-fix.css ]]; then
  cp public/si-search-scope-fix.css "$BACKUP/public/si-search-scope-fix.css"
  touch "$BACKUP/.had-css"
fi

printf '%s\n' "$BACKUP" > .shadow-last-search-scope-fix-backup

cp "$(dirname "$0")/si-search-scope-fix.js" public/si-search-scope-fix.js
cp "$(dirname "$0")/si-search-scope-fix.css" public/si-search-scope-fix.css

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

css='<link rel="stylesheet" href="/si-search-scope-fix.css?v=2.7.2-20260915"/>'
js='<script src="/si-search-scope-fix.js?v=2.7.2-20260915"></script>'

html=re.sub(
    r'\s*<link[^>]+href=["\']/si-search-scope-fix\.css(?:\?[^"\']*)?["\'][^>]*>\s*',
    '\n',
    html,
    flags=re.I
)
html=re.sub(
    r'\s*<script[^>]+src=["\']/si-search-scope-fix\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>\s*',
    '\n',
    html,
    flags=re.I
)

if '</head>' not in html:
    raise SystemExit("ERROR: </head> not found")
html=html.replace('</head>',css+'\n</head>',1)

matches=list(re.finditer(
    r'<script[^>]+src=["\']/app\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>',
    html,
    flags=re.I
))
if not matches:
    raise SystemExit("ERROR: app.js script tag not found")

m=matches[-1]
html=html[:m.end()]+'\n'+js+html[m.end():]

p.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Search button visible only on Map and Search.")
print("Map = magnifier.")
print("Search = X.")
print("X fully closes Search and returns to Map.")
print("Search state/results are cleared on close.")
PY

node --check public/si-search-scope-fix.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Search Scope Fix v2.7.2: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
