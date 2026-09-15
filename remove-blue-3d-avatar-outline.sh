#!/usr/bin/env bash
set -euo pipefail
cd ~/workspace

FILE="public/si-graph.js"
cp "$FILE" "$FILE.before-blue-outline-removal.bak"

python3 - <<'PY'
from pathlib import Path

p = Path("public/si-graph.js")
s = p.read_text(encoding="utf-8")

old = """      c.strokeStyle=`rgba(${col},.92)`;
      c.lineWidth=n.kind==='entity'?1.7:1.2;
      c.beginPath();
      c.arc(p.x,p.y,r+2,0,Math.PI*2);
      c.stroke();

"""

if old not in s:
    raise SystemExit("STOP: exact blue-outline block was not found; file left unchanged.")

s2 = s.replace(old, "", 1)
p.write_text(s2, encoding="utf-8")
print("PASS: blue avatar outline removed from public/si-graph.js")
PY

git diff --check -- public/si-graph.js
git diff -- public/si-graph.js
