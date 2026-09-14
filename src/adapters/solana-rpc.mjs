import { isSafeHttpUrl, isSolanaAddress } from '../utils.mjs';

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/* SHADOW_CURRENT_HOLDINGS_V219_RPC */
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/* SHADOW_CURRENT_HOLDINGS_V219_RPC_END */
const STABLE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD3Bj4yN3nSboERoAaiQh4H' // legacy USDT
]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function rpcEndpoint() {
  if (process.env.SOLANA_RPC_URL && isSafeHttpUrl(process.env.SOLANA_RPC_URL)) return process.env.SOLANA_RPC_URL;
  if (process.env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`;
  return 'https://api.mainnet-beta.solana.com';
}

async function fetchWithRetry(url, init, { fetchImpl = fetch, label = 'request', attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, init);
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts - 1) throw new Error(`${label} HTTP ${response.status}`);
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : Math.min(400 * (2 ** attempt), 4000);
      await sleep(delay);
    } catch (error) {
      lastError = error;
      const retryable = /429|5\d\d|timeout|fetch failed|network/i.test(String(error?.message || error));
      if (!retryable || attempt === attempts - 1) throw error;
      await sleep(Math.min(400 * (2 ** attempt), 4000));
    }
  }
  throw lastError || new Error(`${label} failed`);
}

async function rpc(method, params, { fetchImpl = fetch } = {}) {
  const response = await fetchWithRetry(rpcEndpoint(), {
    method: 'POST', headers: { 'content-type':'application/json', accept:'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }), signal:AbortSignal.timeout(12000)
  }, { fetchImpl, label:'Solana RPC' });
  const body = await response.json();
  if (body?.error) throw new Error(body.error.message || `Solana RPC ${method} failed`);
  return body?.result;
}

function accountKeyText(key) { return typeof key === 'string' ? key : key?.pubkey || ''; }
function uiAmount(balance) {
  const u = balance?.uiTokenAmount;
  if (!u) return 0;
  if (u.uiAmount != null) return Number(u.uiAmount) || 0;
  const amount = Number(u.amount || 0); const decimals = Number(u.decimals || 0);
  return amount / (10 ** decimals);
}
function ownerBalances(list, wallet) {
  const map = new Map();
  for (const row of list || []) {
    if (row?.owner !== wallet || !row?.mint) continue;
    map.set(row.mint, (map.get(row.mint) || 0) + uiAmount(row));
  }
  return map;
}
function programIds(tx) {
  const ids = new Set();
  const visit = (ix) => { if (ix?.programId) ids.add(String(ix.programId)); };
  for (const ix of tx?.transaction?.message?.instructions || []) visit(ix);
  for (const inner of tx?.meta?.innerInstructions || []) for (const ix of inner?.instructions || []) visit(ix);
  return ids;
}

function normalizeRpcTransaction(tx, wallet, signature) {
  if (!tx?.meta || tx.meta.err) return [];
  const keys = tx.transaction?.message?.accountKeys || [];
  const walletIndex = keys.findIndex(k => accountKeyText(k) === wallet);
  const solDelta = walletIndex >= 0 ? ((Number(tx.meta.postBalances?.[walletIndex] || 0) - Number(tx.meta.preBalances?.[walletIndex] || 0)) / 1e9) : 0;
  const pre = ownerBalances(tx.meta.preTokenBalances, wallet);
  const post = ownerBalances(tx.meta.postTokenBalances, wallet);
  const mints = new Set([...pre.keys(), ...post.keys()]);
  const pids = programIds(tx);
  const isPump = pids.has(PUMP_PROGRAM) || pids.has(PUMP_AMM_PROGRAM);
  const source = pids.has(PUMP_PROGRAM) ? 'pump.fun' : pids.has(PUMP_AMM_PROGRAM) ? 'PumpSwap' : 'solana';
  const changes = [];
  for (const mint of mints) {
    if (mint === WSOL_MINT || STABLE_MINTS.has(mint)) continue;
    const tokenDelta = (post.get(mint) || 0) - (pre.get(mint) || 0);
    if (Math.abs(tokenDelta) < 1e-12) continue;
    let type = tokenDelta > 0 ? 'receive' : 'send';
    // RPC fallback has no decoded swap event. Only use buy/sell heuristics for known Pump programs.
    if (isPump && tokenDelta > 0 && solDelta < -0.00001) type = 'buy';
    else if (isPump && tokenDelta < 0 && solDelta > 0.00001) type = 'sell';
    changes.push({
      signature, slot: tx.slot || 0, blockTime: tx.blockTime || null, type, source,
      description: `${type} ${Math.abs(tokenDelta)} token`, mint, tokenAmount: tokenDelta,
      solAmount: type === 'buy' || type === 'sell' ? solDelta : 0, isPump, rawType: 'RPC'
    });
  }
  return collapseFallbackChanges(changes);
}

function transferDelta(transfers, wallet) {
  const map = new Map();
  for (const t of transfers || []) {
    const mint = t?.mint;
    if (!mint || mint === WSOL_MINT || STABLE_MINTS.has(mint)) continue;
    let delta = 0;
    if (t.toUserAccount === wallet) delta += Number(t.tokenAmount || 0);
    if (t.fromUserAccount === wallet) delta -= Number(t.tokenAmount || 0);
    if (delta) map.set(mint, (map.get(mint) || 0) + delta);
  }
  return map;
}
function nativeDelta(transfers, wallet) {
  let lamports = 0;
  for (const t of transfers || []) {
    if (t.toUserAccount === wallet) lamports += Number(t.amount || 0);
    if (t.fromUserAccount === wallet) lamports -= Number(t.amount || 0);
  }
  return lamports / 1e9;
}
function rawSwapAmount(row) {
  const raw = row?.rawTokenAmount;
  if (!raw) return Number(row?.tokenAmount || 0) || 0;
  const amount = Number(raw.tokenAmount || 0);
  const decimals = Math.max(0, Number(raw.decimals || 0));
  return amount / (10 ** decimals);
}
function swapRows(rows, wallet) {
  const all = Array.isArray(rows) ? rows.filter(r => r?.mint) : [];
  const owned = all.filter(r => !r.userAccount || r.userAccount === wallet);
  return (owned.length ? owned : all).map(r => ({ mint:r.mint, amount:Math.abs(rawSwapAmount(r)) })).filter(r => r.amount > 0);
}
function aggregateSwapLegs(inputs, outputs) {
  const net = new Map();
  for (const row of inputs) net.set(row.mint, (net.get(row.mint) || 0) - row.amount);
  for (const row of outputs) net.set(row.mint, (net.get(row.mint) || 0) + row.amount);
  return [...net.entries()].map(([mint,amount]) => ({mint,amount})).filter(r => Math.abs(r.amount) > 1e-12 && r.mint !== WSOL_MINT && !STABLE_MINTS.has(r.mint));
}
function chooseLargest(rows, sign) {
  return rows.filter(r => sign > 0 ? r.amount > 0 : r.amount < 0).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount))[0] || null;
}
function nativeSwapNet(swap, wallet) {
  const input = swap?.nativeInput && (!swap.nativeInput.account || swap.nativeInput.account === wallet) ? Number(swap.nativeInput.amount || 0) / 1e9 : 0;
  const output = swap?.nativeOutput && (!swap.nativeOutput.account || swap.nativeOutput.account === wallet) ? Number(swap.nativeOutput.amount || 0) / 1e9 : 0;
  return output - input;
}

function normalizeEnhancedSwap(tx, wallet) {
  const swap = tx?.events?.swap;
  if (!swap) return null;
  const legs = aggregateSwapLegs(swapRows(swap.tokenInputs,wallet), swapRows(swap.tokenOutputs,wallet));
  const solNet = nativeSwapNet(swap,wallet);
  const isPump = /pump/i.test(String(tx.source || '')) || /pump/i.test(String(tx.description || ''));
  const base = { signature:tx.signature,slot:tx.slot||0,blockTime:tx.timestamp||null,source:String(tx.source||'SWAP'),description:tx.description||'',isPump,rawType:tx.type||'SWAP' };

  if (solNet < -0.000001) {
    const bought = chooseLargest(legs,1);
    if (bought) return [{...base,type:'buy',mint:bought.mint,tokenAmount:bought.amount,solAmount:solNet}];
  }
  if (solNet > 0.000001) {
    const sold = chooseLargest(legs,-1);
    if (sold) return [{...base,type:'sell',mint:sold.mint,tokenAmount:sold.amount,solAmount:solNet}];
  }

  const bought = chooseLargest(legs,1);
  const sold = chooseLargest(legs,-1);
  if (bought && sold) {
    return [{...base,type:'swap',mint:bought.mint,tokenAmount:bought.amount,solAmount:0,
      description:tx.description || `Swapped ${Math.abs(sold.amount)} ${sold.mint} for ${bought.amount} ${bought.mint}`}];
  }
  return null;
}

function collapseFallbackChanges(changes) {
  if (changes.length <= 1) return changes;
  const buys = changes.filter(x=>x.type==='buy');
  const sells = changes.filter(x=>x.type==='sell');
  // A decoded transaction should be one user-facing event. If fallback heuristics produced
  // several same-direction legs, keep one canonical leg and preserve the full description.
  if (buys.length && !sells.length) return [buys.sort((a,b)=>Math.abs(b.tokenAmount)-Math.abs(a.tokenAmount))[0]];
  if (sells.length && !buys.length) return [sells.sort((a,b)=>Math.abs(b.tokenAmount)-Math.abs(a.tokenAmount))[0]];
  return changes.filter(x=>x.type==='receive'||x.type==='send').slice(0,1);
}

function normalizeHeliusTransaction(tx, wallet) {
  if (!tx?.signature || tx?.transactionError) return [];
  if (String(tx.type || '').toUpperCase() === 'SWAP') {
    const decoded = normalizeEnhancedSwap(tx,wallet);
    if (decoded?.length) return decoded;
  }

  const deltas = transferDelta(tx.tokenTransfers, wallet);
  const solDelta = nativeDelta(tx.nativeTransfers, wallet);
  const src = String(tx.source || tx.type || 'solana');
  const isPump = /pump/i.test(src) || /pump/i.test(String(tx.description || ''));
  const out=[];
  for (const [mint, tokenDelta] of deltas) {
    let type = tokenDelta > 0 ? 'receive' : 'send';
    // Never turn a generic transfer into a trade merely because the wallet paid a network fee.
    // Only known Pump interactions may use SOL/token direction as a fallback trade signal.
    if (isPump && tokenDelta > 0 && solDelta < -0.00001) type='buy';
    else if (isPump && tokenDelta < 0 && solDelta > 0.00001) type='sell';
    out.push({signature:tx.signature,slot:tx.slot||0,blockTime:tx.timestamp||null,type,source:src,description:tx.description||'',mint,tokenAmount:tokenDelta,solAmount:type==='buy'||type==='sell'?solDelta:0,isPump,rawType:tx.type||''});
  }
  return collapseFallbackChanges(out);
}

async function heliusRecent(address, { limit = 20, before = '', fetchImpl = fetch } = {}) {
  if (!process.env.HELIUS_API_KEY) return null;
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set('api-key', process.env.HELIUS_API_KEY);
  url.searchParams.set('limit', String(Math.max(1, Math.min(limit, 100))));
  if (before) url.searchParams.set('before', before);
  const response = await fetchWithRetry(url, { headers:{accept:'application/json'}, signal:AbortSignal.timeout(12000) }, { fetchImpl, label:'Helius' });
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function heliusSince(address, { limit = 20, untilSignature = '', fetchImpl = fetch } = {}) {
  const pageSize = untilSignature ? 100 : Math.max(1,Math.min(limit,100));
  const maxPages = untilSignature ? 5 : 1;
  const collected=[];
  let before='';
  for (let page=0; page<maxPages; page++) {
    const rows=await heliusRecent(address,{limit:pageSize,before,fetchImpl});
    if (!rows.length) break;
    const idx=untilSignature ? rows.findIndex(x=>x.signature===untilSignature) : -1;
    if (idx >= 0) { collected.push(...rows.slice(0,idx)); break; }
    collected.push(...rows);
    if (!untilSignature || rows.length < pageSize) break;
    before=rows.at(-1)?.signature || '';
    if (!before) break;
    await sleep(80);
  }
  return collected;
}

/* SHADOW_CURRENT_HOLDINGS_V219_RPC */
function parsedTokenAccountHolding(row) {
  const info=row?.account?.data?.parsed?.info;
  const mint=String(info?.mint||'');
  const amountInfo=info?.tokenAmount;
  if(!mint||!amountInfo)return null;

  const decimals=Math.max(0,Number(amountInfo.decimals||0));
  let amount=Number(amountInfo.uiAmountString);
  if(!Number.isFinite(amount)){
    if(amountInfo.uiAmount!=null) amount=Number(amountInfo.uiAmount);
    else amount=Number(amountInfo.amount||0)/(10**decimals);
  }

  if(!Number.isFinite(amount)||amount<=1e-12)return null;
  if(mint===WSOL_MINT||STABLE_MINTS.has(mint))return null;
  return {mint,amount,decimals};
}

export async function getWalletTokenHoldings(address,{fetchImpl=fetch}={}) {
  if(!isSolanaAddress(address))throw new Error('Invalid Solana wallet address');

  const fetchProgram=async programId=>{
    const result=await rpc('getTokenAccountsByOwner',[
      address,
      {programId},
      {encoding:'jsonParsed',commitment:'confirmed'}
    ],{fetchImpl});
    return Array.isArray(result?.value)?result.value:[];
  };

  // A snapshot is only committed if both token programs succeed.
  // This prevents a temporary RPC problem from writing a partial portfolio.
  const [classic,token2022]=await Promise.all([
    fetchProgram(TOKEN_PROGRAM),
    fetchProgram(TOKEN_2022_PROGRAM)
  ]);

  const byMint=new Map();
  for(const row of [...classic,...token2022]){
    const h=parsedTokenAccountHolding(row);
    if(!h)continue;
    const current=byMint.get(h.mint);
    if(current){
      current.amount+=h.amount;
      current.decimals=Math.max(current.decimals,h.decimals);
    }else{
      byMint.set(h.mint,{...h});
    }
  }

  return {
    provider:process.env.HELIUS_API_KEY?'helius-rpc':process.env.SOLANA_RPC_URL?'custom-rpc':'public-rpc',
    holdings:[...byMint.values()].filter(h=>h.amount>1e-12)
  };
}
/* SHADOW_CURRENT_HOLDINGS_V219_RPC_END */

export async function getRecentWalletActivity(address, { limit = 20, untilSignature = '', fetchImpl = fetch } = {}) {
  if (!isSolanaAddress(address)) throw new Error('Invalid Solana wallet address');
  if (process.env.HELIUS_API_KEY) {
    const rows = await heliusSince(address,{limit,untilSignature,fetchImpl});
    const activity = rows.flatMap(tx => normalizeHeliusTransaction(tx,address));
    return { provider:'helius', signatures:rows.map(x=>x.signature), activity };
  }
  const options = { commitment:'confirmed', limit:Math.max(1,Math.min(limit,100)) };
  if (untilSignature) options.until = untilSignature;
  const sigRows = await rpc('getSignaturesForAddress',[address,options],{fetchImpl}) || [];
  const good = sigRows.filter(x=>!x.err);
  const txRows=[];
  for (const row of good.slice().reverse()) {
    try {
      const tx = await rpc('getTransaction',[row.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0,encoding:'jsonParsed'}],{fetchImpl});
      if (tx) txRows.push({signature:row.signature,tx});
    } catch (error) {
      if (!/not supported|version/i.test(String(error.message))) throw error;
    }
  }
  return { provider:'solana-rpc', signatures:good.map(x=>x.signature), activity:txRows.flatMap(x=>normalizeRpcTransaction(x.tx,address,x.signature)) };
}

export async function solanaHealth({ fetchImpl = fetch } = {}) {
  try {
    const result = await rpc('getHealth',[],{fetchImpl});
    return { configured:!!process.env.SOLANA_RPC_URL || !!process.env.HELIUS_API_KEY, provider:process.env.HELIUS_API_KEY?'helius':process.env.SOLANA_RPC_URL?'custom-rpc':'public-rpc', status:result === 'ok' ? 'online' : String(result || 'online') };
  } catch (error) {
    return { configured:!!process.env.SOLANA_RPC_URL || !!process.env.HELIUS_API_KEY, provider:process.env.HELIUS_API_KEY?'helius':process.env.SOLANA_RPC_URL?'custom-rpc':'public-rpc', status:'offline', error:error.message };
  }
}
