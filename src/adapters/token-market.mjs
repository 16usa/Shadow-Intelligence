const DEX_BASE = 'https://api.dexscreener.com';
const PUMP_BASE = 'https://frontend-api-v3.pump.fun';

/* SHADOW_PUMP_LIVE_MC_V394 */
const pumpCoinCache=new Map();
const PUMP_DEFAULT_CACHE_MS=2000;
/* SHADOW_PUMP_LIVE_MC_V394_END */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function liquidity(pair) { return num(pair?.liquidity?.usd); }

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


function heliusEndpoint() {
  if(String(process.env.HELIUS_AUXILIARY_ENABLED||'').toLowerCase()!=='true')return '';
  const key=String(process.env.HELIUS_API_KEY||'').trim();
  return key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : '';
}

function assetImage(asset) {
  const direct=String(asset?.content?.links?.image||'').trim();
  if(direct)return direct;
  const files=Array.isArray(asset?.content?.files)?asset.content.files:[];
  const imageFile=files.find(f=>String(f?.mime||'').toLowerCase().startsWith('image/'))||files[0];
  return String(imageFile?.cdn_uri||imageFile?.uri||'').trim();
}

function normalizeAsset(asset) {
  if(!asset?.id)return null;
  const meta=asset?.content?.metadata||{};
  const rawSymbol=String(meta?.symbol||asset?.token_info?.symbol||'').replace(/^\$/,'').trim();
  return {
    mint:String(asset.id),
    name:String(meta?.name||'').trim(),
    symbol:rawSymbol ? `$${rawSymbol}` : '',
    image:assetImage(asset)
  };
}

export async function getTokenMetadataBatch(mints,{fetchImpl=fetch}={}) {
  const endpoint=heliusEndpoint();
  const unique=[...new Set((mints||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const out=new Map();
  if(!endpoint||!unique.length)return out;

  for(let offset=0;offset<unique.length;offset+=500){
    const ids=unique.slice(offset,offset+500);
    try{
      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({
          jsonrpc:'2.0',
          id:`shadow-token-meta-${offset}`,
          method:'getAssetBatch',
          params:{ids}
        }),
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok)continue;
      const body=await response.json();
      const assets=Array.isArray(body?.result)?body.result:Array.isArray(body)?body:[];
      for(const asset of assets){
        const meta=normalizeAsset(asset);
        if(meta)out.set(meta.mint,meta);
      }
    }catch(error){
      console.warn('Helius token metadata batch failed:',String(error?.message||error));
    }
  }
  return out;
}


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
    priceChange:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),
    priceChange5m:pair?.priceChange?.m5 == null ? null : num(pair?.priceChange?.m5),
    priceChange1h:pair?.priceChange?.h1 == null ? null : num(pair?.priceChange?.h1),
    priceChange6h:pair?.priceChange?.h6 == null ? null : num(pair?.priceChange?.h6),
    priceChange24h:pair?.priceChange?.h24 == null ? null : num(pair?.priceChange?.h24),
    volume24h:num(pair?.volume?.h24),
    marketCap:null,
    liquidityUsd:liquidity(pair),
    dexId:pair?.dexId||'',
    externalUrl:pair?.url||'',
    pairAddress:String(pair?.pairAddress||''),
    marketCreatedAtMs:Number(pair?.pairCreatedAt||0)||null,
    isPump:dexText.includes('pump')
  };
}

export async function getTokenMarketsBatch(mints,{fetchImpl=fetch}={}){
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
/* SHADOW_TOP_24H_MOVERS_V250_MARKET_END */

export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {
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
