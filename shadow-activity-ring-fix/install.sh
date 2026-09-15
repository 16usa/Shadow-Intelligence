#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"

for f in public/index.html public/app.js; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/activity-ring-fix-v2.7.3-${STAMP}"
mkdir -p "$BACKUP/public"

cp public/index.html "$BACKUP/public/index.html"

if [[ -f public/si-activity-ring-fix.js ]]; then
  cp public/si-activity-ring-fix.js "$BACKUP/public/si-activity-ring-fix.js"
  touch "$BACKUP/.had-js"
fi

if [[ -f public/si-activity-ring-fix.css ]]; then
  cp public/si-activity-ring-fix.css "$BACKUP/public/si-activity-ring-fix.css"
  touch "$BACKUP/.had-css"
fi

printf '%s\n' "$BACKUP" > .shadow-last-activity-ring-fix-backup

cp "$(dirname "$0")/si-activity-ring-fix.js" public/si-activity-ring-fix.js
cp "$(dirname "$0")/si-activity-ring-fix.css" public/si-activity-ring-fix.css

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

css='<link rel="stylesheet" href="/si-activity-ring-fix.css?v=2.7.3-20260915"/>'
js='<script src="/si-activity-ring-fix.js?v=2.7.3-20260915"></script>'

html=re.sub(
    r'\s*<link[^>]+href=["\']/si-activity-ring-fix\.css(?:\?[^"\']*)?["\'][^>]*>\s*',
    '\n',
    html,
    flags=re.I
)
html=re.sub(
    r'\s*<script[^>]+src=["\']/si-activity-ring-fix\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>\s*',
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
print("Activity/beacon logic: KEPT")
print("Beacon DOM + timers + persistence: KEPT")
print("Persistent green avatar ring: REMOVED")
print("Dark/light themes: supported")
PY

node --check public/si-activity-ring-fix.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Activity Ring Fix v2.7.3: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
