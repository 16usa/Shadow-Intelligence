#!/usr/bin/env bash
set -euo pipefail
cd "${1:-$HOME/workspace}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/fastest-1h-v2.5.5-${STAMP}"
for f in server.mjs src/adapters/token-market.mjs public/si-top-movers.js public/si-top-movers.css public/index.html; do
  [[ -f "$f" ]] || { echo "ERROR: missing $f"; exit 1; }
done
mkdir -p "$BACKUP/src/adapters" "$BACKUP/public"
cp server.mjs "$BACKUP/server.mjs"
cp src/adapters/token-market.mjs "$BACKUP/src/adapters/token-market.mjs"
cp public/si-top-movers.js "$BACKUP/public/si-top-movers.js"
cp public/si-top-movers.css "$BACKUP/public/si-top-movers.css"
cp public/index.html "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-fastest-1h-backup
cp "$(dirname "$0")/si-top-movers.js" public/si-top-movers.js
cp "$(dirname "$0")/si-top-movers.css" public/si-top-movers.css

python3 - <<'PY'
from pathlib import Path
import re
sp=Path("server.mjs"); ap=Path("src/adapters/token-market.mjs"); hp=Path("public/index.html")
s=sp.read_text(); a=ap.read_text(); h=hp.read_text()

# Add exact 1H field to the existing mover market adapter.
if "priceChange1h:" not in a:
    a=a.replace(
        "priceChange:num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5),",
        "priceChange:num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5),\n    priceChange1h:num(pair?.priceChange?.h1),",
        1
    )
if "priceChange1h:" not in a:
    raise SystemExit("ERROR: could not add priceChange1h")

# Convert the existing 24H mover server logic to a single 1H leader.
s=s.replace("const TOP_MOVERS_CACHE_MS=90000;","const TOP_MOVERS_CACHE_MS=45000;",1)
s=s.replace("function moverSparkline24h(db,tokenId,currentPrice,change24h){","function moverSparkline1h(db,tokenId,currentPrice,change1h){",1)
s=s.replace("Date.now()-24*60*60*1000","Date.now()-60*60*1000",1)
s=s.replace("const change=Number(change24h||0);","const change=Number(change1h||0);",1)
s=s.replace("const change24h=Number(market.priceChange24h||0);","const change1h=Number(market.priceChange1h||0);",1)
s=s.replace("if(!Number.isFinite(change24h))continue;","if(!Number.isFinite(change1h)||change1h<=0)continue;",1)
s=s.replace("change24h,","change1h,",1)

old = """  const positive=fresh
    .filter(item=>item.change24h>0)
    .sort((a,b)=>b.change24h-a.change24h)
    .slice(0,12);

  const items=positive.map(item=>({
    ...item,
    sparkline:moverSparkline24h(db,item.id,item.priceUsd,item.change24h)
  }));

  return {items,asOf:now,windowHours:24};"""
new = """  const leader=fresh.sort((a,b)=>b.change1h-a.change1h)[0];
  if(!leader)return {items:[],asOf:now,windowHours:1};

  const items=[{
    ...leader,
    sparkline:moverSparkline1h(db,leader.id,leader.priceUsd,leader.change1h)
  }];

  return {items,asOf:now,windowHours:1};"""

if old not in s:
    raise SystemExit("ERROR: expected 24H ranking block not found")
s=s.replace(old,new,1)
s=s.replace("return {items:[],asOf:nowIso(),windowHours:24};","return {items:[],asOf:nowIso(),windowHours:1};",1)
s=s.replace("{items:[],asOf:nowIso(),windowHours:24,error:'Market movers temporarily unavailable'}","{items:[],asOf:nowIso(),windowHours:1,error:'Market mover temporarily unavailable'}",1)

h,n1=re.subn(r'(/si-top-movers\.css\?v=)[^"\']+',r'\g<1>2.5.5-20260915',h,count=1)
h,n2=re.subn(r'(/si-top-movers\.js\?v=)[^"\']+',r'\g<1>2.5.5-20260915',h,count=1)
if n1!=1 or n2!=1:
    raise SystemExit("ERROR: mover cache-buster not found")

ap.write_text(a); sp.write_text(s); hp.write_text(h)
print("PATCH: PASS")
print("Shows exactly one token: strongest positive mover over the last 1 hour")
print("Sparkline window: 1 hour")
print("Server cache: 45 seconds")
print("Browser refresh: 60 seconds")
PY

node --check server.mjs
node --check src/adapters/token-market.mjs
node --check public/si-top-movers.js
git diff --check
echo
echo "Shadow 1H Fastest Mover v2.5.5: INSTALLED"
echo "Backup: $BACKUP"
echo "IMPORTANT: restart the main Shadow/Replit app once."
