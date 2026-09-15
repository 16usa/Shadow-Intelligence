#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

HTML="public/index.html"
JS="public/si-tokens-card-fix.js"

[[ -f "$HTML" ]] || { echo "ERROR: missing $HTML"; exit 1; }
[[ -f "public/app.js" ]] || { echo "ERROR: missing public/app.js"; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-card-fix-v2.6.3-${STAMP}"
mkdir -p "$BACKUP/public"

cp "$HTML" "$BACKUP/public/index.html"
if [[ -f "$JS" ]]; then
  cp "$JS" "$BACKUP/public/si-tokens-card-fix.js"
  touch "$BACKUP/.had-js"
fi
printf '%s\n' "$BACKUP" > .shadow-last-tokens-card-fix-backup

cp "$(dirname "$0")/si-tokens-card-fix.js" "$JS"

python3 - <<'PY'
from pathlib import Path
import re

p=Path("public/index.html")
html=p.read_text(encoding="utf-8")

tag='<script src="/si-tokens-card-fix.js?v=2.6.3-20260915"></script>'

if "si-tokens-card-fix.js" in html:
    html,_=re.subn(
        r'<script[^>]+src=["\']/si-tokens-card-fix\.js(?:\?[^"\']*)?["\'][^>]*></script>',
        tag,
        html,
        count=1
    )
else:
    # Must load after app.js so it can safely override the Tokens renderer.
    matches=list(re.finditer(r'<script[^>]+src=["\']/app\.js(?:\?[^"\']*)?["\'][^>]*></script>',html))
    if not matches:
        raise SystemExit("ERROR: app.js script tag not found")
    m=matches[-1]
    html=html[:m.end()]+'\n'+tag+html[m.end():]

p.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Added visible Age to every token card")
print("1M percent now recovers from live minute samples")
print("No fragile server.mjs text replacement")
print("No server restart required")
PY

node --check "$JS"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Card Fix v2.6.3: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari. 1M needs about one minute to build its first live comparison."
