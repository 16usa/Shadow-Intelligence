
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"ERROR: {label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"ERROR: {label}: end marker not found")
    return text[:start] + replacement + text[end:]

# 1) Market adapter
p = Path("src/adapters/token-market.mjs")
s = p.read_text()

if "SHADOW_PUMP_LIVE_MC_V394" not in s:
    s = replace_once(
        s,
        "const DEX_BASE = 'https://api.dexscreener.com';\n",
        "const DEX_BASE = 'https://api.dexscreener.com';\n"
        "const PUMP_BASE = 'https://frontend-api-v3.pump.fun';\n\n"
        "/* SHADOW_PUMP_LIVE_MC_V394 */\n"
        "const pumpCoinCache=new Map();\n"
        "const PUMP_DEFAULT_CACHE_MS=2000;\n"
        "/* SHADOW_PUMP_LIVE_MC_V394_END */\n",
        "Pump base/cache"
    )

    helper_anchor = "function liquidity(pair) { return num(pair?.liquidity?.usd); }\n"
    pump_helpers = r'''
function positiveNumberOrNull(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:null;
}

function normalizePumpCoin(mint,body){
  const data=Array.isArray(body)
    ? body[0]
    : (body?.data&&typeof body.data==='object' ? body.data : body);

  if(!data||typeof data!=='object')return null;

  const returnedMint=String(data.mint||mint||'').trim();
  if(!returnedMint || (mint && returnedMint!==mint))return null;

  const rawSymbol=String(data.symbol||'').replace(/^\$/,'').trim();
  const createdRaw=
    data.created_timestamp ??
    data.createdTimestamp ??
    data.created_at ??
    data.createdAt ??
    null;

  let createdAtMs=null;
  if(createdRaw!=null&&createdRaw!==''){
    const n=Number(createdRaw);
    if(Number.isFinite(n)&&n>0){
      createdAtMs=n<1e12?n*1000:n;
    }else{
      const parsed=Date.parse(String(createdRaw));
      if(Number.isFinite(parsed))createdAtMs=parsed;
    }
  }

  return {
    mint:returnedMint,
    symbol:rawSymbol?`$${rawSymbol}`:'',
    name:String(data.name||'').trim(),
    image:String(data.image_uri||data.imageUri||data.image||'').trim(),
    marketCap:positiveNumberOrNull(
      data.usd_market_cap ??
      data.usdMarketCap
    ),
    createdAtMs,
    complete:!!data.complete,
    pumpSwapPool:String(data.pump_swap_pool||data.pumpSwapPool||'').trim(),
    externalUrl:`https://pump.fun/coin/${encodeURIComponent(returnedMint)}`,
    isPump:true,
    marketCapSource:'pump.fun'
  };
}

export async function getPumpTokenMarket(
  mint,
  {fetchImpl=fetch,maxAgeMs=PUMP_DEFAULT_CACHE_MS,timeoutMs=3500}={}
){
  const key=String(mint||'').trim();
  if(!key)return null;

  const now=Date.now();
  const cached=pumpCoinCache.get(key);
  if(
    cached &&
    Number.isFinite(Number(maxAgeMs)) &&
    Number(maxAgeMs)>=0 &&
    now-cached.at<=Number(maxAgeMs)
  ){
    return cached.value;
  }

  try{
    const response=await fetchImpl(
      `${PUMP_BASE}/coins-v2/${encodeURIComponent(key)}`,
      {
        headers:{
          accept:'application/json',
          'user-agent':'ShadowIntelligence/0.7'
        },
        signal:AbortSignal.timeout(Math.max(500,Number(timeoutMs)||3500))
      }
    );

    if(!response.ok)return null;

    const value=normalizePumpCoin(key,await response.json());
    if(!value)return null;

    pumpCoinCache.set(key,{at:Date.now(),value});
    return value;
  }catch(error){
    console.debug('Pump.fun live market fetch failed:',String(error?.message||error));
    return null;
  }
}

export async function getPumpTokenMarketCap(mint,options={}){
  const market=await getPumpTokenMarket(mint,options);
  const mc=Number(market?.marketCap);
  return Number.isFinite(mc)&&mc>0?mc:null;
}

export async function getPumpTokenMarketsBatch(
  mints,
  {fetchImpl=fetch,concurrency=10,maxAgeMs=PUMP_DEFAULT_CACHE_MS,timeoutMs=3500}={}
){
  const unique=[...new Set((mints||[])
    .map(value=>String(value||'').trim())
    .filter(Boolean))];

  const out=new Map();
  if(!unique.length)return out;

  let cursor=0;
  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=unique.length)return;

      const mint=unique[index];
      const market=await getPumpTokenMarket(mint,{
        fetchImpl,
        maxAgeMs,
        timeoutMs
      });

      if(market)out.set(mint,market);
    }
  }

  await Promise.all(
    Array.from(
      {length:Math.min(Math.max(1,Number(concurrency)||10),unique.length)},
      worker
    )
  );

  return out;
}

'''
    s = replace_once(
        s,
        helper_anchor,
        helper_anchor + pump_helpers,
        "Pump market helpers"
    )

s = s.replace(
    "    marketCap:num(pair?.marketCap ?? pair?.fdv),\n",
    "    marketCap:null,\n",
    1
)

batch_start = "export async function getTokenMarketsBatch(mints,{fetchImpl=fetch}={}){"
batch_end = "/* SHADOW_TOP_24H_MOVERS_V250_MARKET_END */"
new_batch = r'''export async function getTokenMarketsBatch(mints,{fetchImpl=fetch}={}){
  const unique=[...new Set((mints||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const out=new Map();

  // DexScreener is retained ONLY for change/price/liquidity fields used by
  // existing UI features. Its marketCap/fdv is explicitly ignored.
  for(let offset=0;offset<unique.length;offset+=30){
    const chunk=unique.slice(offset,offset+30);
    const wanted=new Set(chunk);

    try{
      const url=`${DEX_BASE}/tokens/v1/solana/${chunk.map(encodeURIComponent).join(',')}`;
      const response=await fetchImpl(url,{
        headers:{accept:'application/json','user-agent':'ShadowIntelligence/0.7'},
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
        const tokenPairs=grouped.get(mint)||[];
        const best=[...tokenPairs].sort((a,b)=>liquidity(b)-liquidity(a))[0];
        const market=moverMarketFromPair(mint,best);

        if(market){
          const created=tokenPairs
            .map(pair=>Number(pair?.pairCreatedAt||0))
            .filter(value=>Number.isFinite(value)&&value>0);

          market.marketCreatedAtMs=created.length?Math.min(...created):null;
          market.marketCap=null;
          out.set(mint,market);
        }
      }
    }catch(error){
      console.warn('DexScreener non-MC market fetch failed:',String(error?.message||error));
    }
  }

  // Pump.fun is the sole authority for USD market cap.
  const pump=await getPumpTokenMarketsBatch(unique,{
    fetchImpl,
    concurrency:10,
    maxAgeMs:PUMP_DEFAULT_CACHE_MS,
    timeoutMs:3500
  });

  for(const mint of unique){
    const pumpMarket=pump.get(mint);
    const base=out.get(mint);

    if(!pumpMarket){
      if(base){
        base.marketCap=null;
        base.marketCapSource='';
        out.set(mint,base);
      }
      continue;
    }

    out.set(mint,{
      mint,
      symbol:pumpMarket.symbol||base?.symbol||`$${mint.slice(0,4)}`,
      name:pumpMarket.name||base?.name||mint.slice(0,8),
      image:pumpMarket.image||base?.image||'',
      priceUsd:Number(base?.priceUsd||0),
      priceChange:base?.priceChange ?? null,
      priceChange5m:base?.priceChange5m ?? null,
      priceChange1h:base?.priceChange1h ?? null,
      priceChange6h:base?.priceChange6h ?? null,
      priceChange24h:base?.priceChange24h ?? null,
      volume24h:Number(base?.volume24h||0),
      marketCap:pumpMarket.marketCap,
      marketCapSource:'pump.fun',
      liquidityUsd:Number(base?.liquidityUsd||0),
      dexId:base?.dexId||'',
      externalUrl:pumpMarket.externalUrl||base?.externalUrl||'',
      pairAddress:base?.pairAddress||'',
      marketCreatedAtMs:pumpMarket.createdAtMs||base?.marketCreatedAtMs||null,
      isPump:true
    });
  }

  return out;
}
'''
s = replace_between(s, batch_start, batch_end, new_batch, "Batch market function")

single_start = "export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {"
single_index = s.find(single_start)
if single_index < 0:
    raise SystemExit("ERROR: single token market function not found")

new_single = r'''export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {
  const key=String(mint||'').trim();
  if(!key)return null;

  const pumpPromise=getPumpTokenMarket(key,{
    fetchImpl,
    maxAgeMs:PUMP_DEFAULT_CACHE_MS,
    timeoutMs:3500
  });

  let dexMarket=null;

  try{
    const response=await fetchImpl(
      `${DEX_BASE}/token-pairs/v1/solana/${encodeURIComponent(key)}`,
      {
        headers:{accept:'application/json','user-agent':'ShadowIntelligence/0.7'},
        signal:AbortSignal.timeout(7000)
      }
    );

    if(response.ok){
      const data=await response.json();
      const pairs=Array.isArray(data)?data:Array.isArray(data?.pairs)?data.pairs:[];
      const relevant=pairs.filter(pair=>pair?.chainId==='solana');
      const pair=relevant.sort((a,b)=>liquidity(b)-liquidity(a))[0];

      if(pair){
        dexMarket=moverMarketFromPair(key,pair);
        if(dexMarket)dexMarket.marketCap=null;
      }
    }
  }catch{}

  const pumpMarket=await pumpPromise;
  let market=null;

  if(pumpMarket){
    market={
      mint:key,
      symbol:pumpMarket.symbol||dexMarket?.symbol||`$${key.slice(0,4)}`,
      name:pumpMarket.name||dexMarket?.name||key.slice(0,8),
      image:pumpMarket.image||dexMarket?.image||'',
      priceUsd:Number(dexMarket?.priceUsd||0),
      priceChange:dexMarket?.priceChange ?? null,
      priceChange5m:dexMarket?.priceChange5m ?? null,
      priceChange1h:dexMarket?.priceChange1h ?? dexMarket?.priceChange ?? null,
      priceChange6h:dexMarket?.priceChange6h ?? null,
      priceChange24h:dexMarket?.priceChange24h ?? null,
      marketCap:pumpMarket.marketCap,
      marketCapSource:'pump.fun',
      liquidityUsd:Number(dexMarket?.liquidityUsd||0),
      dexId:dexMarket?.dexId||'',
      externalUrl:pumpMarket.externalUrl||dexMarket?.externalUrl||'',
      marketCreatedAtMs:pumpMarket.createdAtMs||dexMarket?.marketCreatedAtMs||null,
      isPump:true
    };
  }else if(dexMarket){
    market={
      ...dexMarket,
      marketCap:null,
      marketCapSource:''
    };
  }

  // Metadata-only fallback. It never supplies market cap.
  if(!market?.image && !pumpMarket){
    const meta=(await getTokenMetadataBatch([key],{fetchImpl})).get(key);

    if(meta){
      market={
        mint:key,
        symbol:market?.symbol && market.symbol!==`$${key.slice(0,4)}`
          ? market.symbol
          : (meta.symbol||market?.symbol||`$${key.slice(0,4)}`),
        name:market?.name && market.name!==key.slice(0,8)
          ? market.name
          : (meta.name||market?.name||key.slice(0,8)),
        image:meta.image||'',
        priceUsd:Number(market?.priceUsd||0),
        priceChange:market?.priceChange ?? null,
        priceChange5m:market?.priceChange5m ?? null,
        priceChange1h:market?.priceChange1h ?? market?.priceChange ?? null,
        priceChange6h:market?.priceChange6h ?? null,
        priceChange24h:market?.priceChange24h ?? null,
        marketCap:null,
        marketCapSource:'',
        liquidityUsd:Number(market?.liquidityUsd||0),
        dexId:market?.dexId||'',
        externalUrl:market?.externalUrl||'',
        marketCreatedAtMs:market?.marketCreatedAtMs||null,
        isPump:false
      };
    }
  }

  return market;
}
'''
s = s[:single_index] + new_single
p.write_text(s)

# 2) Server
p = Path("server.mjs")
s = p.read_text()

s = replace_once(
    s,
    "import { getTokenMarket, getTokenMetadataBatch, getTokenMarketsBatch } from './src/adapters/token-market.mjs';\n",
    "import { getTokenMarket, getTokenMetadataBatch, getTokenMarketsBatch, getPumpTokenMarket } from './src/adapters/token-market.mjs';\n",
    "server token market import"
)

s = replace_once(
    s,
    "const TOKENS_PERIOD_CACHE_MS=60000;\n",
    "const TOKENS_PERIOD_CACHE_MS=20000;\n",
    "tokens market cache"
)

pump_created_start = "async function pumpTokenCreatedAt(mint){"
pump_created_end = "async function mapLimit(items,limit,worker){"
new_pump_created = r'''async function pumpTokenCreatedAt(mint){
  const market=await getPumpTokenMarket(mint,{
    maxAgeMs:2000,
    timeoutMs:3500
  });
  return normalizeCreationMs(market?.createdAtMs);
}

'''
s = replace_between(
    s,
    pump_created_start,
    pump_created_end,
    new_pump_created,
    "pump creation lookup"
)

s = replace_once(
    s,
    '''        byMint.set(mint,{
          m1:null,m5:null,h1:null,h6:null,h24:null,
          marketCap:Number(row.market_cap||0),
          createdAt:created.createdAt,
          ageSource:created.source
        });
''',
    '''        byMint.set(mint,{
          m1:null,m5:null,h1:null,h6:null,h24:null,
          marketCap:null,
          marketCapSource:'',
          createdAt:created.createdAt,
          ageSource:created.source
        });
''',
    "no stale MC fallback"
)

s = replace_once(
    s,
    '''        marketCap:Number.isFinite(Number(market.marketCap))
          ? Number(market.marketCap)
          : Number(row.market_cap||0),
        createdAt:created.createdAt,
''',
    '''        marketCap:Number.isFinite(Number(market.marketCap)) && Number(market.marketCap)>0
          ? Number(market.marketCap)
          : null,
        marketCapSource:Number.isFinite(Number(market.marketCap)) && Number(market.marketCap)>0
          ? 'pump.fun'
          : '',
        createdAt:created.createdAt,
''',
    "Pump MC only in token period payload"
)

s = replace_once(
    s,
    '''      market_cap:p.marketCap??row.market_cap,

      // If Pump lookup failed, return null instead of reviving an old
''',
    '''      market_cap:Object.prototype.hasOwnProperty.call(p,'marketCap')
        ? p.marketCap
        : null,
      market_cap_source:p.marketCapSource||'',
      market_cap_live_at:p.marketCapSource==='pump.fun'
        ? new Date(tokensPeriodCache.at).toISOString()
        : null,

      // If Pump lookup failed, return null instead of reviving an old
''',
    "token response MC provenance"
)

snapshot_anchor = '''    const nowIsoValue=new Date(nowMs).toISOString();

    for(const row of rows){
'''
snapshot_replacement = '''    const nowIsoValue=new Date(nowMs).toISOString();
    const updatePumpMarketCap=db.prepare(`
      UPDATE tokens
      SET market_cap=?,last_market_at=?
      WHERE id=?
    `);

    for(const row of rows){
'''
s = replace_once(
    s,
    snapshot_anchor,
    snapshot_replacement,
    "Pump MC persistence statement"
)

price_anchor = '''      const price=Number(market.priceUsd||0);
      let m1=null;

      if(row.id && Number.isFinite(price) && price>0){
'''
price_replacement = '''      const pumpMarketCap=Number(market.marketCap);
      if(
        row.id &&
        Number.isFinite(pumpMarketCap) &&
        pumpMarketCap>0 &&
        market.marketCapSource==='pump.fun'
      ){
        updatePumpMarketCap.run(pumpMarketCap,nowIsoValue,row.id);
      }

      const price=Number(market.priceUsd||0);
      let m1=null;

      if(row.id && Number.isFinite(price) && price>0){
'''
s = replace_once(
    s,
    price_anchor,
    price_replacement,
    "persist Pump MC"
)

api_anchor = "  /* SHADOW_TOKEN_ENTITY_GRAPH_V350_API */\n"
pump_api = r'''  /* SHADOW_PUMP_LIVE_MC_V394_API */
  if (
    parts[0]==='api' &&
    parts[1]==='tokens' &&
    parts[2] &&
    parts[3]==='pump-market' &&
    parts.length===4 &&
    method==='GET'
  ) {
    const mint=clean(parts[2],120);

    if(!mint || !isSolanaAddress(mint)){
      return json(res,400,{error:'Invalid Solana token mint'});
    }

    const pump=await getPumpTokenMarket(mint,{
      fetchImpl:fetch,
      maxAgeMs:1000,
      timeoutMs:2500
    });

    const marketCap=Number(pump?.marketCap);

    if(!(Number.isFinite(marketCap)&&marketCap>0)){
      return json(res,503,{
        mint,
        marketCap:null,
        source:'pump.fun',
        error:'Live Pump.fun market cap unavailable'
      });
    }

    const asOf=nowIso();

    db.prepare(`
      UPDATE tokens
      SET market_cap=?,last_market_at=?
      WHERE mint=?
    `).run(marketCap,asOf,mint);

    return json(res,200,{
      mint,
      marketCap,
      source:'pump.fun',
      asOf
    });
  }
  /* SHADOW_PUMP_LIVE_MC_V394_API_END */

'''
if "SHADOW_PUMP_LIVE_MC_V394_API" not in s:
    s = replace_once(s, api_anchor, pump_api + api_anchor, "Pump live MC API")

p.write_text(s)

# 3) Copy engine
p = Path("src/internal-copy-engine.mjs")
s = p.read_text()

import_anchor = "import { fileURLToPath } from 'node:url';\n"
if "getPumpTokenMarketCap" not in s:
    s = replace_once(
        s,
        import_anchor,
        import_anchor + "import { getPumpTokenMarketCap } from './adapters/token-market.mjs';\n",
        "copy engine Pump MC import"
    )

s = replace_once(
    s,
    "  function handleTradeEvent(event={}){\n",
    "  async function handleTradeEvent(event={}){\n",
    "async copy trade handler"
)

subscriptions_anchor = '''    const subscriptions=db.prepare(`
      SELECT *
      FROM copy_subscriptions
      WHERE entity_id=? AND enabled=1
      ORDER BY updated_at DESC
    `).all(entityId);

    let candidates=0;
    let blockedByMarketCap=0;
'''
subscriptions_replacement = '''    const subscriptions=db.prepare(`
      SELECT *
      FROM copy_subscriptions
      WHERE entity_id=? AND enabled=1
      ORDER BY updated_at DESC
    `).all(entityId);

    const marketCapRequired=
      side==='buy' &&
      subscriptions.some(sub=>{
        if(!sub.copy_buys)return false;
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));
        const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        return min>0||max>0;
      });

    let pumpMarketCapUsd=null;

    if(marketCapRequired){
      pumpMarketCapUsd=await getPumpTokenMarketCap(
        String(event.mint||''),
        {
          fetchImpl,
          maxAgeMs:750,
          timeoutMs:1800
        }
      );

      if(Number.isFinite(Number(pumpMarketCapUsd))&&Number(pumpMarketCapUsd)>0){
        db.prepare(`
          UPDATE tokens
          SET market_cap=?,last_market_at=?
          WHERE mint=?
        `).run(
          Number(pumpMarketCapUsd),
          now(),
          String(event.mint||'')
        );
      }
    }

    let candidates=0;
    let blockedByMarketCap=0;
'''
s = replace_once(
    s,
    subscriptions_anchor,
    subscriptions_replacement,
    "copy engine Pump MC fetch"
)

old_filter = '''        if(rangeEnabled){
          const mc=Number(event.cachedMarketCapUsd||0);
          const age=Number(event.cachedMarketAgeMs);
          const fresh=mc>0 && Number.isFinite(age) && age<=5000;

          if(!fresh || (min>0&&mc<min) || (max>0&&mc>max)){
            blockedByMarketCap++;
            continue;
          }
        }
'''
new_filter = '''        if(rangeEnabled){
          const mc=Number(pumpMarketCapUsd||0);
          const fresh=mc>0;

          // Pump.fun is the sole MC authority for this policy.
          // If it cannot provide current MC, BUY fails closed.
          if(!fresh || (min>0&&mc<min) || (max>0&&mc>max)){
            blockedByMarketCap++;
            continue;
          }
        }
'''
s = replace_once(
    s,
    old_filter,
    new_filter,
    "copy MC filter source"
)

s = s.replace(
    "    marketCapSource:'current_at_execution',\n",
    "    marketCapSource:'pump.fun_live',\n",
    1
)

p.write_text(s)

# 4) Client
p = Path("public/app.js")
s = p.read_text()

s = replace_once(
    s,
    "        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${money(t.market_cap||0)}</small>\n",
    "        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${Number(t.market_cap)>0?money(t.market_cap):'—'}</small>\n",
    "token card live MC display"
)

detail_marker = "/* SHADOW_TOKEN_ENTITY_GRAPH_V350_CLIENT */\n"
if "SHADOW_PUMP_LIVE_MC_V394_CLIENT" not in s:
    client_helpers = r'''/* SHADOW_PUMP_LIVE_MC_V394_CLIENT */
let tokenDetailMarketTimer=null;

function stopTokenDetailMarketTimer(){
  if(tokenDetailMarketTimer){
    clearInterval(tokenDetailMarketTimer);
    tokenDetailMarketTimer=null;
  }
}

async function refreshTokenDetailPumpMarket(mint,graph){
  const el=$('#tokenDetailMarketCap');
  if(!el || state.detailGraph!==graph){
    stopTokenDetailMarketTimer();
    return;
  }

  try{
    const data=await api(`/api/tokens/${encodeURIComponent(mint)}/pump-market`);
    if(state.detailGraph!==graph)return;

    const mc=Number(data?.marketCap);
    if(!(Number.isFinite(mc)&&mc>0))return;

    el.textContent=money(mc);
    el.dataset.source='pump.fun';

    const token=state.tokens.find(row=>String(row?.mint||'')===String(mint||''));
    if(token){
      token.market_cap=mc;
      token.market_cap_source='pump.fun';
      token.market_cap_live_at=data?.asOf||new Date().toISOString();
    }
  }catch(error){
    console.debug('Live Pump.fun MC unavailable',error);
  }
}
/* SHADOW_PUMP_LIVE_MC_V394_CLIENT_END */

'''
    s = replace_once(
        s,
        detail_marker,
        client_helpers + detail_marker,
        "token detail Pump helper"
    )

old_detail_modal = '''  modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(t,'xl')}<h2>${esc(t.symbol||'Token')}</h2><p>${esc(t.name||'Unknown')}</p><p>${tokenAddressCopyHtml(t.mint)}</p><div class="si-metrics"><div class="si-metric"><strong>${money(t.market_cap||0)}</strong><small>Market cap</small></div><div class="si-metric"><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong><small>Change</small></div><div class="si-metric"><strong>${money(t.liquidity_usd||0)}</strong><small>Liquidity</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>RECENT SIGNALS</span></div>${related.slice(0,12).map(eventHtml).join('')||'<div class="guest-note">No recent incident records.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);
'''
new_detail_modal = '''  stopTokenDetailMarketTimer();

  modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(t,'xl')}<h2>${esc(t.symbol||'Token')}</h2><p>${esc(t.name||'Unknown')}</p><p>${tokenAddressCopyHtml(t.mint)}</p><div class="si-metrics"><div class="si-metric"><strong id="tokenDetailMarketCap">—</strong><small>Market cap</small></div><div class="si-metric"><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong><small>Change</small></div><div class="si-metric"><strong>${money(t.liquidity_usd||0)}</strong><small>Liquidity</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>RECENT SIGNALS</span></div>${related.slice(0,12).map(eventHtml).join('')||'<div class="guest-note">No recent incident records.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);
'''
s = replace_once(
    s,
    old_detail_modal,
    new_detail_modal,
    "token detail initial MC"
)

graph_anchor = '''  state.detailGraph=graph;
  bindTokenAddressCopy($('#modalBody')||document);

  try{
'''
graph_replacement = '''  state.detailGraph=graph;
  bindTokenAddressCopy($('#modalBody')||document);

  refreshTokenDetailPumpMarket(t.mint,graph);
  tokenDetailMarketTimer=setInterval(()=>{
    refreshTokenDetailPumpMarket(t.mint,graph);
  },3000);

  try{
'''
s = replace_once(
    s,
    graph_anchor,
    graph_replacement,
    "start token detail live MC"
)

close_anchor = '''function closeModal(){
  if(typeof closeEntityMetricInfo==='function' && closeEntityMetricInfo())return;
'''
close_replacement = '''function closeModal(){
  if(typeof closeEntityMetricInfo==='function' && closeEntityMetricInfo())return;
  if(typeof stopTokenDetailMarketTimer==='function')stopTokenDetailMarketTimer();
'''
s = replace_once(
    s,
    close_anchor,
    close_replacement,
    "stop token MC timer"
)

p.write_text(s)

print("Patched:")
print("  src/adapters/token-market.mjs")
print("  server.mjs")
print("  src/internal-copy-engine.mjs")
print("  public/app.js")
print()
print("MC authority: Pump.fun coins-v2 usd_market_cap only.")
print("Token detail: live Pump.fun refresh every 3 seconds.")
print("Token list: Pump.fun MC; stale DB fallback removed.")
print("Copy BUY MC filter: direct Pump.fun MC, fail-closed if unavailable.")
print("Helius is not used for market cap.")
print("DexScreener marketCap/fdv is ignored.")
