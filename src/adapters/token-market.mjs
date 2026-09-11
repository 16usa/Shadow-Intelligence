const DEX_BASE = 'https://api.dexscreener.com';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function liquidity(pair) { return num(pair?.liquidity?.usd); }

export async function getTokenMarket(mint, { fetchImpl = fetch } = {}) {
  if (!mint) return null;
  const url = `${DEX_BASE}/token-pairs/v1/solana/${encodeURIComponent(mint)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShadowIntelligence/0.4' },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const pairs = Array.isArray(data) ? data : Array.isArray(data?.pairs) ? data.pairs : [];
    const relevant = pairs.filter(p => p?.chainId === 'solana');
    const pair = relevant.sort((a, b) => liquidity(b) - liquidity(a))[0];
    if (!pair) return null;
    const baseIsMint = pair?.baseToken?.address === mint;
    const token = baseIsMint ? pair.baseToken : (pair?.quoteToken?.address === mint ? pair.quoteToken : pair.baseToken);
    const dexText = `${pair.dexId || ''} ${pair.url || ''}`.toLowerCase();
    const isPump = dexText.includes('pump');
    const priceChange = num(pair?.priceChange?.h1 ?? pair?.priceChange?.h24 ?? pair?.priceChange?.m5);
    return {
      mint,
      symbol: token?.symbol ? `$${String(token.symbol).replace(/^\$/,'')}` : `$${mint.slice(0,4)}`,
      name: token?.name || mint.slice(0,8),
      image: pair?.info?.imageUrl || '',
      priceUsd: num(pair?.priceUsd),
      priceChange,
      marketCap: num(pair?.marketCap ?? pair?.fdv),
      liquidityUsd: liquidity(pair),
      dexId: pair?.dexId || '',
      externalUrl: pair?.url || '',
      isPump
    };
  } catch { return null; }
}
