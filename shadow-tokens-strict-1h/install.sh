#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

SERVER="server.mjs"
ADAPTER="src/adapters/token-market.mjs"
APP="public/app.js"
HTML="public/index.html"

for f in "$SERVER" "$ADAPTER" "$APP" "$HTML"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-strict-1h-v2.5.7-${STAMP}"
mkdir -p "$BACKUP/src/adapters" "$BACKUP/public"

cp "$SERVER" "$BACKUP/server.mjs"
cp "$ADAPTER" "$BACKUP/src/adapters/token-market.mjs"
cp "$APP" "$BACKUP/public/app.js"
cp "$HTML" "$BACKUP/public/index.html"
printf '%s\n' "$BACKUP" > .shadow-last-tokens-strict-1h-backup

python3 - <<'PY'
from pathlib import Path
import re

server_path=Path("server.mjs")
adapter_path=Path("src/adapters/token-market.mjs")
app_path=Path("public/app.js")
html_path=Path("public/index.html")

server=server_path.read_text(encoding="utf-8")
adapter=adapter_path.read_text(encoding="utf-8")
app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

# 1) Ensure batch market helper is imported.
old_import="import { getTokenMarket, getTokenMetadataBatch } from './src/adapters/token-market.mjs';"
new_import="import { getTokenMarket, getTokenMetadataBatch, getTokenMarketsBatch } from './src/adapters/token-market.mjs';"

if old_import in server:
    server=server.replace(old_import,new_import,1)

if "getTokenMarketsBatch" not in server:
    raise SystemExit("ERROR: getTokenMarketsBatch is unavailable. Install the market movers patch first.")

# 2) Strict 1H semantics. Never fall back to 24H or 5m.
adapter=adapter.replace(
    "priceChange1h:num(pair?.priceChange?.h1),",
    "priceChange1h:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),"
)

adapter=adapter.replace(
    "const priceChange = num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5);",
    "const priceChange = pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1);"
)

adapter=adapter.replace(
    "priceChange:num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5),",
    "priceChange:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),"
)

adapter=adapter.replace(
    "priceChange:market?.priceChange||0,",
    "priceChange:market?.priceChange ?? null,"
)

if "priceChange1h:" not in adapter:
    raise SystemExit("ERROR: priceChange1h field was not found in token-market.mjs")

# 3) Add 60-second server cache for one consistent Tokens-page snapshot.
helper_marker="/* SHADOW_TOKENS_STRICT_1H_V257 */"
if helper_marker not in server:
    anchor="function feedRows(db, limit = 30) {"
    if anchor not in server:
        raise SystemExit("ERROR: server helper anchor not found")

    helper=r"""
/* SHADOW_TOKENS_STRICT_1H_V257 */
const TOKENS_STRICT_1H_CACHE_MS=60000;
let tokensStrict1hCache={at:0,key:'',byMint:new Map()};

async function tokensWithStrict1h(items){
  const rows=Array.isArray(items)?items:[];
  const mints=[...new Set(rows.map(row=>String(row?.mint||'').trim()).filter(Boolean))];
  if(!mints.length)return rows;

  const key=mints.slice().sort().join(',');
  const age=Date.now()-Number(tokensStrict1hCache.at||0);

  if(tokensStrict1hCache.key!==key || age>=TOKENS_STRICT_1H_CACHE_MS){
    const markets=await getTokenMarketsBatch(mints);
    const byMint=new Map();

    for(const mint of mints){
      const market=markets.get(mint);
      const raw=market?.priceChange1h;
      const value=raw==null?null:Number(raw);
      byMint.set(mint,Number.isFinite(value)?value:null);
    }

    tokensStrict1hCache={at:Date.now(),key,byMint};
  }

  return rows.map(row=>({
    ...row,
    price_change:tokensStrict1hCache.byMint.get(String(row.mint)) ?? null,
    price_change_period:'1h',
    price_change_live_at:new Date(tokensStrict1hCache.at).toISOString()
  }));
}
/* SHADOW_TOKENS_STRICT_1H_V257_END */

"""
    server=server.replace(anchor,helper+anchor,1)

# 4) Enrich the existing /api/tokens response.
start="/* SHADOW_CURRENT_HOLDINGS_V219_API */"
end="/* SHADOW_CURRENT_HOLDINGS_V219_API_END */"
i=server.find(start)
j=server.find(end,i)
if i<0 or j<0:
    raise SystemExit("ERROR: /api/tokens route markers not found")

block=server[i:j]

if "items:strict1hItems" not in block:
    pattern=re.compile(r"return\s+json\(res,\s*200,\s*\{\s*items\s*,",re.S)
    replacement="const strict1hItems=await tokensWithStrict1h(items);\n    return json(res,200,{\n      items:strict1hItems,"
    block2,n=pattern.subn(replacement,block,count=1)
    if n!=1:
        raise SystemExit("ERROR: could not patch /api/tokens response")
    server=server[:i]+block2+server[j:]

# 5) Tokens renderer now explicitly labels every percentage as 1H.
render_start=app.find("function renderTokens(){")
next_marker=app.find("/* SHADOW_LIVE_AVATAR_STABILITY_V2410_START */",render_start)

if render_start<0 or next_marker<0:
    raise SystemExit("ERROR: renderTokens block not found")

new_render=r"""function renderTokens(){
  const a=state.tokens;
  $('#tokensGrid').innerHTML=a.map(t=>{
    const raw=t.price_change;
    const change=raw==null?null:Number(raw);
    const known=Number.isFinite(change);
    const changeClass=!known?'':change>=0?'pos':'neg';
    const changeText=!known
      ? '1H —'
      : `1H ${change>=0?'+':''}${change.toFixed(1)}%`;

    return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
      ${siTokenAvatarHtml(t)}
      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)}</small>
      </div>
      <strong class="${changeClass}">${changeText}</strong>
    </article>`;
  }).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';

  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;
    openObject('token',{mint:x.dataset.token});
  });
}
"""

app=app[:render_start]+new_render+app[next_marker:]

# 6) Safari cache-buster.
html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-strict-1h-2.5.7-20260915',
    html,
    count=1
)

if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-strict-1h-2.5.7-20260915\2',
        html,
        count=1
    )

if n!=1:
    raise SystemExit("ERROR: app.js script tag not found")

server_path.write_text(server,encoding="utf-8")
adapter_path.write_text(adapter,encoding="utf-8")
app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Tokens percentage is now STRICT 1H only")
print("No fallback to 24H or 5m")
print("UI format: 1H +36.1%")
print("Missing h1: 1H —")
print("1H snapshot cache: 60 seconds")
PY

node --check server.mjs
node --check src/adapters/token-market.mjs
node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Strict 1H v2.5.7: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "IMPORTANT: restart the main Shadow/Replit app once."
echo "Then refresh Safari."
