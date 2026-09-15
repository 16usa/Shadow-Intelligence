#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

CSS="public/si-current.css"
HTML="public/index.html"
VERSION="v2.4.9"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/x-hairline-${VERSION}-${STAMP}"

if [[ ! -f "$CSS" || ! -f "$HTML" ]]; then
  echo "ERROR: Shadow project files not found in: $ROOT"
  exit 1
fi

mkdir -p "$BACKUP"
cp "$CSS" "$BACKUP/si-current.css"
cp "$HTML" "$BACKUP/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-x-hairline-backup

python3 - <<'PY'
from pathlib import Path
import re

css_path = Path("public/si-current.css")
html_path = Path("public/index.html")

css = css_path.read_text(encoding="utf-8")

low = css.lower()
if "--si-line:#eff3f4" not in low:
    raise SystemExit("ERROR: light --si-line #EFF3F4 not found")
if "--si-line:#2f3336" not in low:
    raise SystemExit("ERROR: dark --si-line #2F3336 not found")

# If the previous unification patch has not been applied yet, normalize the
# duplicate immersive neutral line token first. This does not touch semantic
# red/green/blue borders.
css = re.sub(r'(?m)^[ \t]*--imm-line:[^;\n]+;[ \t]*\n?', '', css)
css = css.replace("var(--imm-line,var(--si-line))", "var(--si-line)")
css = css.replace("var(--imm-line)", "var(--si-line)")

# Convert ONLY neutral Shadow borders/dividers that use --si-line from
# 1 CSS px to a Retina-friendly hairline. Semantic borders remain unchanged.
pattern = re.compile(r'(?<![\d.])1px(?=\s+solid\s+var\(--si-line\))')
css, changed = pattern.subn("0.5px", css)

# Also handle any calc/fallback-free canonical declarations where spacing
# is compacted exactly around the token.
pattern_compact = re.compile(r'(?<![\d.])1px(?=solid\s+var\(--si-line\))')
css, changed2 = pattern_compact.subn("0.5px", css)

total = changed + changed2

if total == 0:
    # Idempotency: if already installed, allow a clean no-op only if hairlines exist.
    if "0.5px solid var(--si-line)" not in css and "0.5pxsolid var(--si-line)" not in css:
        raise SystemExit("ERROR: no neutral 1px --si-line borders were found")

if "--imm-line" in css:
    raise SystemExit("ERROR: --imm-line still remains after normalization")

css_path.write_text(css, encoding="utf-8")

html = html_path.read_text(encoding="utf-8")
html, cache_changed = re.subn(
    r'(/si-current\.css\?v=)[^"\']+',
    r'\1x-hairline-2.4.9-20260914',
    html,
    count=1
)
if cache_changed != 1:
    raise SystemExit("ERROR: stylesheet cache-buster link not found")

html_path.write_text(html, encoding="utf-8")

print("PATCH: PASS")
print(f"Neutral 1px borders/dividers changed to 0.5px: {total}")
print("Light line color: #EFF3F4")
print("Dark line color : #2F3336")
print("Neutral width   : 0.5px")
print("Semantic colored borders: unchanged")
PY

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow X-hairline ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "Changed files:"
echo "  public/si-current.css"
echo "  public/index.html"
echo
echo "Rollback:"
echo "  bash shadow-x-hairline/rollback.sh"
