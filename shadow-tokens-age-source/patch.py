
from pathlib import Path

server_path = Path("server.mjs")
if not server_path.exists():
    raise SystemExit("ERROR: server.mjs not found")

server = server_path.read_text(encoding="utf-8")

start = "/* SHADOW_TOKENS_REAL_AGE_V264 */"
end = "/* SHADOW_TOKENS_REAL_AGE_V264_END */"

i = server.find(start)
j = server.find(end, i)
if i < 0 or j < 0:
    raise SystemExit("ERROR: v2.6.4 token-age block not found. Do not continue.")
j += len(end)

helper = r'''/* SHADOW_TOKENS_REAL_AGE_V265 */
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
  if(value==null||value==='')return null;

  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>0){
    const ms=numeric<1e12?numeric*1000:numeric;
    if(ms>=1230768000000 && ms<=Date.now()+86400000)return ms;
  }

  const parsed=Date.parse(String(value));
  if(Number.isFinite(parsed) && parsed>=1230768000000 && parsed<=Date.now()+86400000){
    return parsed;
  }

  return null;
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

async function pumpTokenCreatedAt(mint){
  const url=`https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`;

  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          accept:'application/json',
          'user-agent':'ShadowIntelligence/0.6'
        },
        signal:AbortSignal.timeout(6500)
      });

      if(response.ok){
        const body=await response.json();
        const data=Array.isArray(body)
          ? body[0]
          : (body?.data&&typeof body.data==='object' ? body.data : body);

        const createdMs=normalizeCreationMs(
          data?.created_timestamp ??
          data?.createdTimestamp ??
          data?.created_at ??
          data?.createdAt
        );

        if(createdMs)return createdMs;
      }

      if(response.status!==429 && response.status<500)return null;
    }catch{}

    if(attempt<2)await sleep(attempt===0?300:800);
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

function isPumpToken(row,market){
  return !!row?.is_pump ||
    !!market?.isPump ||
    String(row?.mint||'').toLowerCase().endsWith('pump');
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

    const market=markets.get(mint);
    const pump=isPumpToken(row,market);

    const saved=String(row?.token_created_at||'').trim();
    const savedMs=Date.parse(saved);
    const savedSource=String(row?.token_age_source||'').trim();

    // Pump tokens: ONLY trust Pump's actual coin creation timestamp.
    // Never trust a PumpSwap/Raydium pair timestamp as the token's age.
    if(
      pump &&
      savedSource==='pump_created_timestamp' &&
      saved &&
      Number.isFinite(savedMs)
    ){
      result.set(mint,{createdAt:saved,source:savedSource});
      continue;
    }

    // Non-Pump assets may use the persisted earliest-market timestamp.
    if(
      !pump &&
      saved &&
      Number.isFinite(savedMs) &&
      savedSource!=='shadow_observed'
    ){
      result.set(mint,{createdAt:saved,source:savedSource||'saved'});
      continue;
    }

    unresolved.push({row,market,pump});
  }

  // Conservative concurrency so Pump API does not get hammered/rate-limited.
  await mapLimit(unresolved,4,async item=>{
    const {row,market,pump}=item;
    const mint=String(row?.mint||'').trim();

    let createdMs=null;
    let source='';

    if(pump){
      createdMs=await pumpTokenCreatedAt(mint);

      if(createdMs){
        source='pump_created_timestamp';
      }else{
        // IMPORTANT:
        // do NOT fall back to PumpSwap/Raydium pairCreatedAt for Pump tokens.
        // That timestamp can be the migration/pool age, not the coin age.
        result.set(mint,{createdAt:null,source:'pump_age_unavailable'});
        try{update.run('', 'pump_age_unavailable', row.id)}catch{}
        return;
      }
    }else{
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
    const hasCreatedAt=Object.prototype.hasOwnProperty.call(p,'createdAt');

    return {
      ...row,
      price_change_1m:p.m1??null,
      price_change_5m:p.m5??null,
      price_change_1h:p.h1??null,
      price_change_6h:p.h6??null,
      price_change_24h:p.h24??null,
      price_change:p.h1??row.price_change??null,
      market_cap:p.marketCap??row.market_cap,

      // If Pump lookup failed, return null instead of reviving an old
      // incorrect pair/migration timestamp from the DB row.
      token_created_at:hasCreatedAt?p.createdAt:(row.token_created_at||null),
      token_age_source:p.ageSource??row.token_age_source??'',

      price_change_live_at:new Date(tokensPeriodCache.at).toISOString()
    };
  });
}
/* SHADOW_TOKENS_REAL_AGE_V265_END */'''

server = server[:i] + helper + server[j:]
server_path.write_text(server, encoding="utf-8")

print("PATCH: PASS")
print("Pump token age is now authoritative from Pump created_timestamp only")
print("PumpSwap/Raydium pair age is NEVER used as Pump token age")
print("If Pump age cannot be resolved, UI receives — instead of a false age")
print("Old incorrect fallback ages are ignored and replaced when Pump responds")
