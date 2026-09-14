const DEX_BASE = 'https://api.dexscreener.com';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function liquidity(pair) { return num(pair?.liquidity?.usd); }

function heliusEndpoint() {
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

export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {
  if (!mint) return null;
  let market=null;
  const url = `${DEX_BASE}/token-pairs/v1/solana/${encodeURIComponent(mint)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShadowIntelligence/0.4' },
      signal: AbortSignal.timeout(7000)
    });
    if (response.ok) {
      const data = await response.json();
      const pairs = Array.isArray(data) ? data : Array.isArray(data?.pairs) ? data.pairs : [];
      const relevant = pairs.filter(p => p?.chainId === 'solana');
      const pair = relevant.sort((a, b) => liquidity(b) - liquidity(a))[0];
      if (pair) {
        const baseIsMint = pair?.baseToken?.address === mint;
        const token = baseIsMint ? pair.baseToken : (pair?.quoteToken?.address === mint ? pair.quoteToken : pair.baseToken);
        const dexText = `${pair.dexId || ''} ${pair.url || ''}`.toLowerCase();
        const isPump = dexText.includes('pump');
        const priceChange = num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5);
        market = {
          mint,
          symbol: token?.symbol ? `$${String(token.symbol).replace(/^\$/,'')}` : `$${mint.slice(0,4)}`,
          name: token?.name || mint.slice(0,8),
          image: String(pair?.info?.imageUrl||'').trim(),
          priceUsd: num(pair?.priceUsd),
          priceChange,
          marketCap: num(pair?.marketCap ?? pair?.fdv),
          liquidityUsd: liquidity(pair),
          dexId: pair?.dexId || '',
          externalUrl: pair?.url || '',
          isPump
        };
      }
    }
  } catch {}

  if(!market?.image){
    const meta=(await getTokenMetadataBatch([mint],{fetchImpl})).get(String(mint));
    if(meta){
      market={
        mint,
        symbol:market?.symbol && market.symbol!==`$${mint.slice(0,4)}` ? market.symbol : (meta.symbol||market?.symbol||`$${mint.slice(0,4)}`),
        name:market?.name && market.name!==mint.slice(0,8) ? market.name : (meta.name||market?.name||mint.slice(0,8)),
        image:meta.image||'',
        priceUsd:market?.priceUsd||0,
        priceChange:market?.priceChange||0,
        marketCap:market?.marketCap||0,
        liquidityUsd:market?.liquidityUsd||0,
        dexId:market?.dexId||'',
        externalUrl:market?.externalUrl||'',
        isPump:!!market?.isPump
      };
    }
  }
  return market;
}
