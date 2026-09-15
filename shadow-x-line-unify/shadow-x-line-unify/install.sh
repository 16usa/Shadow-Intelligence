#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

CSS="public/si-current.css"
HTML="public/index.html"
VERSION="v2.4.8"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/x-line-unify-${VERSION}-${STAMP}"

if [[ ! -f "$CSS" || ! -f "$HTML" ]]; then
  echo "ERROR: Shadow project files not found in: $ROOT"
  echo "Expected:"
  echo "  $CSS"
  echo "  $HTML"
  exit 1
fi

mkdir -p "$BACKUP"
cp "$CSS" "$BACKUP/si-current.css"
cp "$HTML" "$BACKUP/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-x-line-backup

python3 - <<'PY'
from pathlib import Path
import re

css_path = Path("public/si-current.css")
html_path = Path("public/index.html")

css = css_path.read_text(encoding="utf-8")

light_ok = "--si-line:#eff3f4" in css.lower()
dark_ok = "--si-line:#2f3336" in css.lower()

if not light_ok:
    raise SystemExit("ERROR: canonical light --si-line #EFF3F4 was not found")
if not dark_ok:
    raise SystemExit("ERROR: canonical dark --si-line #2F3336 was not found")

before = css.count("--imm-line")

# Remove only the duplicate immersive neutral line token definitions.
css, removed_defs = re.subn(
    r'(?m)^[ \t]*--imm-line:[^;\n]+;[ \t]*\n?',
    '',
    css
)

# Make every neutral immersive border use the site's single canonical line token.
css = css.replace("var(--imm-line,var(--si-line))", "var(--si-line)")
css = css.replace("var(--imm-line)", "var(--si-line)")

if "--imm-line" in css:
    raise SystemExit("ERROR: --imm-line still remains after patch")

if removed_defs < 2:
    raise SystemExit(
        f"ERROR: expected at least 2 --imm-line definitions; removed {removed_defs}"
    )

css_path.write_text(css, encoding="utf-8")

html = html_path.read_text(encoding="utf-8")
html, changed = re.subn(
    r'(/si-current\.css\?v=)[^"\']+',
    r'\1x-line-unify-2.4.8-20260914',
    html,
    count=1
)

if changed != 1:
    raise SystemExit("ERROR: stylesheet cache-buster link was not found")

html_path.write_text(html, encoding="utf-8")

print("PATCH: PASS")
print(f"Previous --imm-line occurrences: {before}")
print(f"Removed --imm-line definitions: {removed_defs}")
print("Neutral borders/dividers now use only --si-line")
print("Light: #EFF3F4")
print("Dark : #2F3336")
print("Width: 1px")
PY

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow X-line unify ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "Changed files:"
echo "  public/si-current.css"
echo "  public/index.html"
echo
echo "To rollback:"
echo "  bash shadow-x-line-unify/rollback.sh"
