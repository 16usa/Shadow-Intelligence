#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

VERSION="v2.5.0"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/top-24h-${VERSION}-${STAMP}"

FILES=(
  "server.mjs"
  "src/adapters/token-market.mjs"
  "public/index.html"
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: required Shadow file missing: $f"
    exit 1
  fi
done

mkdir -p "$BACKUP"
for f in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$f")"
  cp "$f" "$BACKUP/$f"
done

if [[ -f public/si-top-movers.js ]]; then
  mkdir -p "$BACKUP/public"
  cp public/si-top-movers.js "$BACKUP/public/si-top-movers.js"
  touch "$BACKUP/.had-js"
fi
if [[ -f public/si-top-movers.css ]]; then
  mkdir -p "$BACKUP/public"
  cp public/si-top-movers.css "$BACKUP/public/si-top-movers.css"
  touch "$BACKUP/.had-css"
fi

printf '%s\n' "$BACKUP" > .shadow-last-top-24h-backup

cp "$(dirname "$0")/si-top-movers.js" public/si-top-movers.js
cp "$(dirname "$0")/si-top-movers.css" public/si-top-movers.css

python3 - <<'PY'
from pathlib import Path

server_path = Path("server.mjs")
adapter_path = Path("src/adapters/token-market.mjs")
html_path = Path("public/index.html")

server = server_path.read_text(encoding="utf-8")
adapter = adapter_path.read_text(encoding="utf-8")
html = html_path.read_text(encoding="utf-8")

# ---------------- token-market.mjs ----------------
market_anchor = "export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {"
batch_block = r'''
/* SHADOW_TOP_24H_MOVERS_V250_MARKET */
function moverMarketFromPair(mint,pair){
  if(!pair)return null;
  const baseIsMint=pair?.baseToken?.address===mint;
  const token=baseIsMint
    ? pair.baseToken
    : (pair?.quoteToken?.address===mint ? pair.quoteToken : pair.baseToken);
  const dexText=`${pair.dexId||''} ${pair.url||''}`.toLowerCase();
  return {
    mint,
    symbol:token?.symbol?`$${String(token.symbol).replace(/^\$/,'')}`:`$${mint.slice(0,4)}`,
    name:token?.name||mint.slice(0,8),
    image:String(pair?.info?.imageUrl||'').trim(),
    priceUsd:num(pair?.priceUsd),
    priceChange:num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5),
    priceChange24h:num(pair?.priceChange?.h24 ?? pair?.priceChange?.h1 ?? pair?.priceChange?.m5),
    volume24h:num(pair?.volume?.h24),
    marketCap:num(pair?.marketCap ?? pair?.fdv),
    liquidityUsd:liquidity(pair),
    dexId:pair?.dexId||'',
    externalUrl:pair?.url||'',
    pairAddress:String(pair?.pairAddress||''),
    isPump:dexText.includes('pump')
  };
}

export async function getTokenMarketsBatch(mints,{fetchImpl=fetch}={}){
  const unique=[...new Set((mints||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const out=new Map();
  for(let offset=0;offset<unique.length;offset+=30){
    const chunk=unique.slice(offset,offset+30);
    const wanted=new Set(chunk);
    try{
      const url=`${DEX_BASE}/tokens/v1/solana/${chunk.map(encodeURIComponent).join(',')}`;
      const response=await fetchImpl(url,{
        headers:{accept:'application/json','user-agent':'ShadowIntelligence/0.5'},
        signal:AbortSignal.timeout(7000)
      });
      if(!response.ok)continue;
      const body=await response.json();
      const pairs=Array.isArray(body)?body:Array.isArray(body?.pairs)?body.pairs:[];
      const grouped=new Map();
      for(const pair of pairs){
        if(pair?.chainId!=='solana')continue;
        for(const address of [pair?.baseToken?.address,pair?.quoteToken?.address]){
          if(!wanted.has(address))continue;
          if(!grouped.has(address))grouped.set(address,[]);
          grouped.get(address).push(pair);
        }
      }
      for(const mint of chunk){
        const best=(grouped.get(mint)||[]).sort((a,b)=>liquidity(b)-liquidity(a))[0];
        const market=moverMarketFromPair(mint,best);
        if(market)out.set(mint,market);
      }
    }catch(error){
      console.warn('DexScreener batch market fetch failed:',String(error?.message||error));
    }
  }
  return out;
}
/* SHADOW_TOP_24H_MOVERS_V250_MARKET_END */

'''

if "SHADOW_TOP_24H_MOVERS_V250_MARKET" not in adapter:
    if market_anchor not in adapter:
        raise SystemExit("ERROR: token-market insertion anchor not found")
    adapter = adapter.replace(market_anchor, batch_block + market_anchor, 1)

# ---------------- server.mjs import ----------------
old_import = "import { getTokenMarket, getTokenMetadataBatch } from './src/adapters/token-market.mjs';"
new_import = "import { getTokenMarket, getTokenMetadataBatch, getTokenMarketsBatch } from './src/adapters/token-market.mjs';"
if old_import in server:
    server = server.replace(old_import,new_import,1)
elif new_import not in server:
    raise SystemExit("ERROR: token-market server import anchor not found")

# ---------------- server helpers ----------------
helper_anchor = "function entityRows(db) {"
helper_block = r'''
/* SHADOW_TOP_24H_MOVERS_V250_SERVER */
const TOP_MOVERS_CACHE_MS=90000;
let topMovers24hCache={at:0,payload:null,promise:null};

function moverSparkline24h(db,tokenId,currentPrice,change24h){
  const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
  const rows=db.prepare(`
    SELECT price_usd AS price,created_at AS at
    FROM market_snapshots
    WHERE token_id=? AND created_at>=? AND price_usd>0
    ORDER BY created_at ASC
    LIMIT 200
  `).all(tokenId,cutoff);

  let values=rows.map(row=>Number(row.price)).filter(n=>Number.isFinite(n)&&n>0);
  const current=Number(currentPrice||0);
  if(current>0 && (!values.length || Math.abs(values[values.length-1]-current)>Math.max(1e-12,current*1e-9))){
    values.push(current);
  }

  if(values.length<2 && current>0){
    const change=Number(change24h||0);
    const divisor=1+(change/100);
    const open=divisor>0?current/divisor:0;
    if(Number.isFinite(open)&&open>0)values=[open,current];
  }

  if(values.length<=32)return values;
  const out=[];
  const last=values.length-1;
  for(let i=0;i<32;i++){
    const index=Math.round((i/31)*last);
    out.push(values[index]);
  }
  return out;
}

async function buildTopMovers24h(db){
  const candidates=db.prepare(`
    SELECT t.*,
      (
        SELECT MAX(COALESCE(NULLIF(a.block_time,''),a.created_at))
        FROM wallet_activity a
        WHERE a.mint=t.mint AND a.type IN ('buy','sell','swap')
      ) AS lastActivity
    FROM tokens t
    WHERE COALESCE(TRIM(t.mint),'')<>''
    ORDER BY
      CASE WHEN COALESCE(t.liquidity_usd,0)>=1000 THEN 0 ELSE 1 END,
      COALESCE(lastActivity,t.last_market_at,t.created_at) DESC
    LIMIT 36
  `).all();

  if(!candidates.length)return {items:[],asOf:nowIso(),windowHours:24};

  const markets=await getTokenMarketsBatch(candidates.map(row=>row.mint));
  const now=nowIso();
  const update=db.prepare(`
    UPDATE tokens SET
      symbol=?,name=?,
      image=CASE WHEN ?<>'' THEN ? ELSE image END,
      price_change=?,price_usd=?,market_cap=?,liquidity_usd=?,
      dex_id=?,external_url=?,last_market_at=?,is_pump=?
    WHERE id=?
  `);
  const insertSnapshot=db.prepare(`
    INSERT INTO market_snapshots
      (id,token_id,price_usd,price_change,market_cap,liquidity_usd,created_at)
    VALUES (?,?,?,?,?,?,?)
  `);
  const latestSnapshot=db.prepare(`
    SELECT created_at FROM market_snapshots
    WHERE token_id=? ORDER BY created_at DESC LIMIT 1
  `);

  const fresh=[];
  for(const row of candidates){
    const market=markets.get(String(row.mint));
    if(!market)continue;

    const price=Number(market.priceUsd||0);
    const change24h=Number(market.priceChange24h||0);
    const liquidityUsd=Number(market.liquidityUsd||0);

    if(!Number.isFinite(price)||price<=0)continue;
    if(!Number.isFinite(change24h))continue;
    if(liquidityUsd<1000)continue;

    update.run(
      market.symbol||row.symbol,
      market.name||row.name,
      market.image||'',
      market.image||'',
      Number(market.priceChange||0),
      price,
      Number(market.marketCap||0),
      liquidityUsd,
      market.dexId||'',
      market.externalUrl||'',
      now,
      market.isPump?1:Number(row.is_pump||0),
      row.id
    );

    const last=latestSnapshot.get(row.id);
    const lastAt=last?.created_at?new Date(last.created_at).getTime():0;
    if(!lastAt || Date.now()-lastAt>=5*60*1000){
      insertSnapshot.run(
        id('mkt_'),
        row.id,
        price,
        Number(market.priceChange||0),
        Number(market.marketCap||0),
        liquidityUsd,
        now
      );
    }

    fresh.push({
      id:row.id,
      mint:row.mint,
      symbol:market.symbol||row.symbol,
      name:market.name||row.name,
      image:market.image||row.image||'',
      priceUsd:price,
      change24h,
      volume24h:Number(market.volume24h||0),
      marketCap:Number(market.marketCap||0),
      liquidityUsd,
      dexId:market.dexId||row.dex_id||'',
      externalUrl:market.externalUrl||row.external_url||'',
      isPump:!!market.isPump
    });
  }

  const positive=fresh
    .filter(item=>item.change24h>0)
    .sort((a,b)=>b.change24h-a.change24h)
    .slice(0,12);

  const items=positive.map(item=>({
    ...item,
    sparkline:moverSparkline24h(db,item.id,item.priceUsd,item.change24h)
  }));

  return {items,asOf:now,windowHours:24};
}

async function topMovers24h(db){
  const age=Date.now()-Number(topMovers24hCache.at||0);
  if(topMovers24hCache.payload && age<TOP_MOVERS_CACHE_MS)return topMovers24hCache.payload;
  if(topMovers24hCache.promise)return topMovers24hCache.promise;

  topMovers24hCache.promise=buildTopMovers24h(db)
    .then(payload=>{
      topMovers24hCache={at:Date.now(),payload,promise:null};
      return payload;
    })
    .catch(error=>{
      topMovers24hCache.promise=null;
      if(topMovers24hCache.payload)return topMovers24hCache.payload;
      throw error;
    });

  return topMovers24hCache.promise;
}
/* SHADOW_TOP_24H_MOVERS_V250_SERVER_END */

'''
if "SHADOW_TOP_24H_MOVERS_V250_SERVER" not in server:
    if helper_anchor not in server:
        raise SystemExit("ERROR: server helper insertion anchor not found")
    server = server.replace(helper_anchor, helper_block + helper_anchor, 1)

# ---------------- server API route ----------------
route_anchor = "  /* SHADOW_CURRENT_HOLDINGS_V219_API */"
route_block = r'''  /* SHADOW_TOP_24H_MOVERS_V250_API */
  if (route === '/api/market/movers' && method === 'GET') {
    try {
      return json(res,200,await topMovers24h(db));
    } catch(error) {
      console.error('Top 24H movers failed:',error);
      return json(res,200,{items:[],asOf:nowIso(),windowHours:24,error:'Market movers temporarily unavailable'});
    }
  }
  /* SHADOW_TOP_24H_MOVERS_V250_API_END */

'''
if "SHADOW_TOP_24H_MOVERS_V250_API" not in server:
    if route_anchor not in server:
        raise SystemExit("ERROR: server API insertion anchor not found")
    server = server.replace(route_anchor, route_block + route_anchor, 1)

# ---------------- index.html assets ----------------
css_tag = '<link rel="stylesheet" href="/si-top-movers.css?v=2.5.0-20260914"/>'
js_tag = '<script src="/si-top-movers.js?v=2.5.0-20260914"></script>'

if "si-top-movers.css" not in html:
    if "</head>" not in html:
        raise SystemExit("ERROR: </head> not found")
    html = html.replace("</head>", css_tag + "\n</head>", 1)

if "si-top-movers.js" not in html:
    if "</body>" not in html:
        raise SystemExit("ERROR: </body> not found")
    html = html.replace("</body>", js_tag + "\n</body>", 1)

adapter_path.write_text(adapter,encoding="utf-8")
server_path.write_text(server,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Added /api/market/movers")
print("Added DexScreener batch 24H market lookup")
print("Added real 24H snapshot sparkline support")
print("Added mobile horizontal 24H Movers strip on Overview")
PY

node --check server.mjs
node --check src/adapters/token-market.mjs
node --check public/si-top-movers.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Top 24H Movers ${VERSION}: INSTALLED"
echo "Backup: $BACKUP"
echo
echo "Files changed/added:"
echo "  server.mjs"
echo "  src/adapters/token-market.mjs"
echo "  public/index.html"
echo "  public/si-top-movers.js"
echo "  public/si-top-movers.css"
echo
echo "IMPORTANT: restart the Shadow/Replit app once so server.mjs reloads."
echo
echo "Rollback:"
echo "  bash shadow-top-24h/rollback.sh"
