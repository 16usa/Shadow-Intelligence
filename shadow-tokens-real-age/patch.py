
from pathlib import Path
import re

db_path=Path("src/db.mjs")
server_path=Path("server.mjs")
adapter_path=Path("src/adapters/token-market.mjs")
app_path=Path("public/app.js")
html_path=Path("public/index.html")

for p in (db_path,server_path,adapter_path,app_path,html_path):
    if not p.exists():
        raise SystemExit(f"ERROR: missing {p}")

db=db_path.read_text(encoding="utf-8")
server=server_path.read_text(encoding="utf-8")
adapter=adapter_path.read_text(encoding="utf-8")
app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

# 1) Persist token creation time.
if "token_created_at" not in db:
    anchor='  addColumn(db,\'tokens\',"is_pump INTEGER NOT NULL DEFAULT 0");'
    if anchor not in db:
        raise SystemExit("ERROR: tokens migration anchor not found")
    db=db.replace(
        anchor,
        anchor + '\n'
        '  addColumn(db,\'tokens\',"token_created_at TEXT DEFAULT \'\';");\n'
        '  addColumn(db,\'tokens\',"token_age_source TEXT DEFAULT \'\';");',
        1
    )

# 2) Ensure strict market windows exist in batch adapter.
if "priceChange1h:" not in adapter:
    raise SystemExit("ERROR: priceChange1h missing; v2.6.1 is required")

if "priceChange5m:" not in adapter:
    needle="priceChange1h:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),"
    repl=(
        "priceChange5m:pair?.priceChange?.m5 == null ? null : num(pair?.priceChange?.m5),\n"
        "    priceChange1h:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),\n"
        "    priceChange6h:pair?.priceChange?.h6 == null ? null : num(pair?.priceChange?.h6),"
    )
    if needle not in adapter:
        raise SystemExit("ERROR: strict market window anchor not found")
    adapter=adapter.replace(needle,repl,1)

adapter=adapter.replace(
    "priceChange24h:num(pair?.priceChange?.h24 ?? pair?.priceChange?.h1 ?? pair?.priceChange?.m5),",
    "priceChange24h:pair?.priceChange?.h24 == null ? null : num(pair?.priceChange?.h24),"
)

if "priceChange24h:" not in adapter:
    needle="priceChange6h:pair?.priceChange?.h6 == null ? null : num(pair?.priceChange?.h6),"
    if needle not in adapter:
        raise SystemExit("ERROR: priceChange6h anchor not found")
    adapter=adapter.replace(
        needle,
        needle + "\n    priceChange24h:pair?.priceChange?.h24 == null ? null : num(pair?.priceChange?.h24),",
        1
    )

if "marketCreatedAtMs:" not in adapter:
    needle="pairAddress:String(pair?.pairAddress||''),"
    if needle not in adapter:
        raise SystemExit("ERROR: pairAddress anchor not found")
    adapter=adapter.replace(
        needle,
        needle+"\n    marketCreatedAtMs:Number(pair?.pairCreatedAt||0)||null,",
        1
    )

# 3) Replace current Tokens market helper.
marker_pairs=[
    ("/* SHADOW_TOKENS_PERIODS_V261 */","/* SHADOW_TOKENS_PERIODS_V261_END */"),
    ("/* SHADOW_TOKENS_PERIODS_V260 */","/* SHADOW_TOKENS_PERIODS_V260_END */"),
    ("/* SHADOW_TOKENS_STRICT_1H_V257 */","/* SHADOW_TOKENS_STRICT_1H_V257_END */"),
]
found=None
for start,end in marker_pairs:
    i=server.find(start)
    j=server.find(end,i) if i>=0 else -1
    if i>=0 and j>=0:
        found=(i,j+len(end))
        break
if not found:
    raise SystemExit("ERROR: Tokens market helper block not found")
i,j=found

helper=r'''/* SHADOW_TOKENS_REAL_AGE_V264 */
const TOKENS_PERIOD_CACHE_MS=60000;
let tokensPeriodCache={at:0,key:'',byMint:new Map()};

function pctFromPrices(nowPrice,oldPrice){
  const a=Number(nowPrice),b=Number(oldPrice);
  if(!Number.isFinite(a)||a<=0||!Number.isFinite(b)||b<=0)return null;
  return ((a-b)/b)*100;
}

function oneMinuteChange(db,tokenId,currentPrice,nowMs){
  const newestAllowed=new Date(nowMs-55000).toISOString();
  const oldestAllowed=new Date(nowMs-180000).toISOString();
  const row=db.prepare(`
    SELECT price_usd AS price
    FROM market_snapshots
    WHERE token_id=?
      AND created_at>=?
      AND created_at<=?
      AND price_usd>0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tokenId,oldestAllowed,newestAllowed);
  return row?pctFromPrices(currentPrice,row.price):null;
}

function normalizeCreationMs(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)return null;
  const ms=n<1e12?n*1000:n;
  if(ms<1230768000000 || ms>Date.now()+86400000)return null;
  return ms;
}

async function pumpTokenCreatedAt(mint){
  const urls=[
    `https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`,
    `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}?sync=false`
  ];

  for(const url of urls){
    try{
      const response=await fetch(url,{
        headers:{accept:'application/json','user-agent':'ShadowIntelligence/0.6'},
        signal:AbortSignal.timeout(4500)
      });
      if(!response.ok)continue;
      const body=await response.json();
      const data=body?.data&&typeof body.data==='object'?body.data:body;
      const ms=normalizeCreationMs(
        data?.created_timestamp ??
        data?.createdTimestamp ??
        data?.created_at ??
        data?.createdAt
      );
      if(ms)return ms;
    }catch{}
  }
  return null;
}

async function mapLimit(items,limit,worker){
  if(!items.length)return [];
  const out=new Array(items.length);
  let cursor=0;
  async function run(){
    while(true){
      const index=cursor++;
      if(index>=items.length)return;
      out[index]=await worker(items[index],index);
    }
  }
  await Promise.all(
    Array.from({length:Math.min(Math.max(1,limit),items.length)},run)
  );
  return out;
}

async function resolveTokenCreationTimes(db,rows,markets){
  const result=new Map();
  const update=db.prepare(`
    UPDATE tokens
    SET token_created_at=?,token_age_source=?
    WHERE id=?
  `);

  const unresolved=[];

  for(const row of rows){
    const mint=String(row?.mint||'').trim();
    if(!mint)continue;

    const saved=String(row?.token_created_at||'').trim();
    const savedMs=Date.parse(saved);
    if(saved && Number.isFinite(savedMs)){
      result.set(mint,{createdAt:saved,source:String(row?.token_age_source||'saved')});
      continue;
    }

    unresolved.push(row);
  }

  await mapLimit(unresolved,8,async row=>{
    const mint=String(row?.mint||'').trim();
    const market=markets.get(mint);

    let createdMs=null;
    let source='';

    const looksPump=
      !!row?.is_pump ||
      !!market?.isPump ||
      mint.toLowerCase().endsWith('pump');

    if(looksPump){
      createdMs=await pumpTokenCreatedAt(mint);
      if(createdMs)source='pump_created_timestamp';
    }

    // Fallback is never Shadow discovery time.
    if(!createdMs){
      const pairMs=normalizeCreationMs(market?.marketCreatedAtMs);
      if(pairMs){
        createdMs=pairMs;
        source='earliest_market_pair';
      }
    }

    if(createdMs){
      const iso=new Date(createdMs).toISOString();
      result.set(mint,{createdAt:iso,source});
      try{update.run(iso,source,row.id)}catch{}
    }else{
      result.set(mint,{createdAt:null,source:''});
    }
  });

  return result;
}

async function tokensWithMarketPeriods(db,items){
  const rows=Array.isArray(items)?items:[];
  const mints=[...new Set(rows.map(row=>String(row?.mint||'').trim()).filter(Boolean))];
  if(!mints.length)return rows;

  const key=mints.slice().sort().join(',');
  const nowMs=Date.now();
  const age=nowMs-Number(tokensPeriodCache.at||0);

  if(tokensPeriodCache.key!==key || age>=TOKENS_PERIOD_CACHE_MS){
    const markets=await getTokenMarketsBatch(mints);
    const creation=await resolveTokenCreationTimes(db,rows,markets);
    const byMint=new Map();

    const latestSnapshot=db.prepare(`
      SELECT created_at
      FROM market_snapshots
      WHERE token_id=?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const insertSnapshot=db.prepare(`
      INSERT INTO market_snapshots
        (id,token_id,price_usd,price_change,market_cap,liquidity_usd,created_at)
      VALUES (?,?,?,?,?,?,?)
    `);

    const nowIsoValue=new Date(nowMs).toISOString();

    for(const row of rows){
      const mint=String(row?.mint||'').trim();
      if(!mint)continue;

      const market=markets.get(mint);
      const created=creation.get(mint)||{createdAt:null,source:''};

      if(!market){
        byMint.set(mint,{
          m1:null,m5:null,h1:null,h6:null,h24:null,
          marketCap:Number(row.market_cap||0),
          createdAt:created.createdAt,
          ageSource:created.source
        });
        continue;
      }

      const strict=value=>{
        if(value==null)return null;
        const n=Number(value);
        return Number.isFinite(n)?n:null;
      };

      const price=Number(market.priceUsd||0);
      let m1=null;

      if(row.id && Number.isFinite(price) && price>0){
        m1=oneMinuteChange(db,row.id,price,nowMs);

        const last=latestSnapshot.get(row.id);
        const lastAt=last?.created_at?new Date(last.created_at).getTime():0;

        if(!lastAt || nowMs-lastAt>=55000){
          insertSnapshot.run(
            id('mkt_'),
            row.id,
            price,
            strict(market.priceChange1h),
            Number(market.marketCap||0),
            Number(market.liquidityUsd||0),
            nowIsoValue
          );
        }
      }

      byMint.set(mint,{
        m1,
        m5:strict(market.priceChange5m),
        h1:strict(market.priceChange1h),
        h6:strict(market.priceChange6h),
        h24:strict(market.priceChange24h),
        marketCap:Number.isFinite(Number(market.marketCap))
          ? Number(market.marketCap)
          : Number(row.market_cap||0),
        createdAt:created.createdAt,
        ageSource:created.source
      });
    }

    tokensPeriodCache={at:nowMs,key,byMint};
  }

  return rows.map(row=>{
    const p=tokensPeriodCache.byMint.get(String(row.mint))||{};
    return {
      ...row,
      price_change_1m:p.m1??null,
      price_change_5m:p.m5??null,
      price_change_1h:p.h1??null,
      price_change_6h:p.h6??null,
      price_change_24h:p.h24??null,
      price_change:p.h1??row.price_change??null,
      market_cap:p.marketCap??row.market_cap,
      token_created_at:p.createdAt??row.token_created_at??null,
      token_age_source:p.ageSource??row.token_age_source??'',
      price_change_live_at:new Date(tokensPeriodCache.at).toISOString()
    };
  });
}
/* SHADOW_TOKENS_REAL_AGE_V264_END */'''

server=server[:i]+helper+server[j:]

server=server.replace(
    "const strict1hItems=await tokensWithStrict1h(items);",
    "const strict1hItems=await tokensWithMarketPeriods(db,items);"
)

if "await tokensWithMarketPeriods(db,items)" not in server:
    raise SystemExit("ERROR: /api/tokens is not wired to tokensWithMarketPeriods")

# 4) Replace Tokens UI directly.
ui_markers=[
    ("/* SHADOW_TOKENS_PERIOD_AGE_SORT_V261_START */","/* SHADOW_TOKENS_PERIOD_AGE_SORT_V261_END */"),
    ("/* SHADOW_TOKENS_PERIOD_SORT_V260_START */","/* SHADOW_TOKENS_PERIOD_SORT_V260_END */"),
    ("/* SHADOW_TOKENS_SORT_V258_START */","/* SHADOW_TOKENS_SORT_V258_END */"),
]
found=None
for start,end in ui_markers:
    si=app.find(start)
    sj=app.find(end,si) if si>=0 else -1
    if si>=0 and sj>=0:
        found=(si,sj+len(end))
        break
if not found:
    raise SystemExit("ERROR: Tokens UI block not found")
si,sj=found

ui=r'''/* SHADOW_TOKENS_REAL_AGE_UI_V264_START */
let tokenSortMode=(()=>{
  try{
    const saved=localStorage.getItem('si-token-sort');
    const mapped=saved==='top1h'
      ? 'h1'
      : (saved==='newest'||saved==='recent')
        ? 'age'
        : saved;
    return ['m1','m5','h1','h6','h24','age','mc'].includes(mapped)?mapped:'h1';
  }catch{
    return 'h1';
  }
})();

function tokenSortNumber(value,fallback=-Infinity){
  if(value==null||value==='')return fallback;
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function tokenCreatedTimestamp(token){
  const raw=token?.token_created_at||token?.token_market_created_at||'';
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:0;
}

function tokenAgeLabel(token){
  const created=tokenCreatedTimestamp(token);
  if(!created)return '—';

  const minutes=Math.max(0,Math.floor((Date.now()-created)/60000));
  if(minutes<1)return '<1m';
  if(minutes<60)return `${minutes}m`;

  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h`;

  const days=Math.floor(hours/24);
  if(days<30)return `${days}d`;

  const months=Math.floor(days/30);
  if(months<12)return `${months}mo`;

  return `${Math.floor(days/365)}y`;
}

function tokenChangeForMode(token,mode=tokenSortMode){
  if(mode==='m1')return token?.price_change_1m;
  if(mode==='m5')return token?.price_change_5m;
  if(mode==='h1')return token?.price_change_1h ?? token?.price_change;
  if(mode==='h6')return token?.price_change_6h;
  if(mode==='h24')return token?.price_change_24h;
  return token?.price_change_1h ?? token?.price_change;
}

function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  if(tokenSortMode==='age'){
    return out.sort((a,b)=>
      tokenCreatedTimestamp(b)-tokenCreatedTimestamp(a)
      || tokenSortNumber(tokenChangeForMode(b,'h1'))-tokenSortNumber(tokenChangeForMode(a,'h1'))
    );
  }

  if(tokenSortMode==='mc'){
    return out.sort((a,b)=>
      tokenSortNumber(b.market_cap,0)-tokenSortNumber(a.market_cap,0)
      || tokenSortNumber(tokenChangeForMode(b,'h1'))-tokenSortNumber(tokenChangeForMode(a,'h1'))
    );
  }

  return out.sort((a,b)=>
    tokenSortNumber(tokenChangeForMode(b))-tokenSortNumber(tokenChangeForMode(a))
    || tokenSortNumber(b.market_cap,0)-tokenSortNumber(a.market_cap,0)
  );
}

function ensureTokenSortControls(){
  const grid=$('#tokensGrid');
  if(!grid)return;

  let wrap=$('#tokenSortWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='tokenSortWrap';
    wrap.className='si-token-sort-wrap';
    wrap.innerHTML=`
      <div class="si-token-sort" role="group" aria-label="Sort tokens">
        <button type="button" data-token-sort="m1">1M</button>
        <button type="button" data-token-sort="m5">5M</button>
        <button type="button" data-token-sort="h1">1H</button>
        <button type="button" data-token-sort="h6">6H</button>
        <button type="button" data-token-sort="h24">24H</button>
        <button type="button" data-token-sort="age">Age</button>
        <button type="button" data-token-sort="mc">MC</button>
      </div>`;
    grid.before(wrap);
  }

  wrap.querySelectorAll('[data-token-sort]').forEach(button=>{
    const mode=button.dataset.tokenSort;
    const active=mode===tokenSortMode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
    button.onclick=()=>{
      tokenSortMode=mode;
      try{localStorage.setItem('si-token-sort',mode)}catch{}
      renderTokens();
    };
  });
}

function renderTokens(){
  ensureTokenSortControls();

  const a=sortedTokenRows(state.tokens);
  const periodMode=['m1','m5','h1','h6','h24'].includes(tokenSortMode);

  $('#tokensGrid').innerHTML=a.map(t=>{
    const raw=periodMode
      ? tokenChangeForMode(t)
      : tokenChangeForMode(t,'h1');

    const change=raw==null?null:Number(raw);
    const known=Number.isFinite(change);
    const changeClass=!known?'':change>=0?'pos':'neg';
    const changeText=!known
      ? '—'
      : `${change>=0?'+':''}${change.toFixed(1)}%`;

    return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
      ${siTokenAvatarHtml(t)}
      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${money(t.market_cap||0)}</small>
      </div>
      <strong class="${changeClass}">${changeText}</strong>
    </article>`;
  }).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';

  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;
    openObject('token',{mint:x.dataset.token});
  });

  ensureTokenSortControls();
}
/* SHADOW_TOKENS_REAL_AGE_UI_V264_END */'''

app=app[:si]+ui+app[sj:]

# 5) Refresh percentages every ~minute while Tokens page is open.
refresh_start="/* SHADOW_TOKENS_MARKET_REFRESH_V264_START */"
refresh_end="/* SHADOW_TOKENS_MARKET_REFRESH_V264_END */"
if refresh_start in app:
    ri=app.find(refresh_start)
    rj=app.find(refresh_end,ri)
    if rj>=0:
        app=app[:ri]+app[rj+len(refresh_end):]

refresh=r'''
/* SHADOW_TOKENS_MARKET_REFRESH_V264_START */
let tokenMarketRefreshBusy=false;

async function refreshTokensMarketData(){
  const page=$('#page-tokens');
  if(
    document.hidden ||
    !page?.classList.contains('active-page') ||
    tokenMarketRefreshBusy
  )return;

  tokenMarketRefreshBusy=true;
  try{
    const data=await api('/api/tokens');
    if(Array.isArray(data?.items)){
      state.tokens=data.items;
      renderTokens();
    }
  }catch(error){
    console.debug('Tokens market refresh unavailable',error);
  }finally{
    tokenMarketRefreshBusy=false;
  }
}

setInterval(refreshTokensMarketData,65000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refreshTokensMarketData();
});
/* SHADOW_TOKENS_MARKET_REFRESH_V264_END */
'''

insert_after="/* SHADOW_TOKENS_REAL_AGE_UI_V264_END */"
pos=app.find(insert_after)
if pos<0:
    raise SystemExit("ERROR: new Tokens UI marker missing")
pos+=len(insert_after)
app=app[:pos]+refresh+app[pos:]

# 6) Remove failed v2.6.3 overlay script tag.
html=re.sub(
    r'\s*<script[^>]+src=["\']/si-tokens-card-fix\.js(?:\?[^"\']*)?["\'][^>]*></script>\s*',
    '\n',
    html,
    flags=re.I
)

# Cache-bust app.js.
html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-real-age-2.6.4-20260915',
    html,
    count=1
)
if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-real-age-2.6.4-20260915\2',
        html,
        count=1
    )
if n!=1:
    raise SystemExit("ERROR: app.js script tag not found")

db_path.write_text(db,encoding="utf-8")
server_path.write_text(server,encoding="utf-8")
adapter_path.write_text(adapter,encoding="utf-8")
app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Age is visible on every token card")
print("Pump.fun age uses Pump created_timestamp, not Shadow discovery time")
print("Age examples: 42m / 1h / 2d / 3mo")
print("Age sort = youngest token first")
print("Time tabs show the selected price-change percentage")
print("Age/MC keep showing the 1H price-change percentage")
print("Removed v2.6.3 overlay conflict")
