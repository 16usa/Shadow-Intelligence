import crypto from 'node:crypto';
import { id, nowIso, isSolanaAddress } from './utils.mjs';
import { getRecentWalletActivity, solanaHealth, WSOL_MINT, normalizeHeliusTransaction } from './adapters/solana-rpc.mjs';
import { getTokenMarket } from './adapters/token-market.mjs';
import { getXProfile, getXPosts, xConfigured } from './adapters/x-api.mjs';
import { getSetting } from './db.mjs';

const sleep = ms => new Promise(r => setTimeout(r,ms));
const upperSymbol = s => String(s || '').replace(/^\$/,'').toUpperCase();
const isoFromUnix = seconds => seconds ? new Date(Number(seconds)*1000).toISOString() : nowIso();

function extractSolanaMint(text) {
  const candidates=String(text||'').match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g)||[];
  return candidates.find(isSolanaAddress)||'';
}
function extractSymbol(text) {
  const m=String(text||'').match(/\$([A-Za-z][A-Za-z0-9_]{1,14})\b/);
  return m ? `$${m[1].toUpperCase()}` : '';
}
function tokenCacheFresh(row, ms=120000) {
  if(!row?.last_market_at)return false;
  return Date.now()-new Date(row.last_market_at).getTime()<ms;
}

/* SHADOW_TRADE_ONLY_V239_LIVE */
const TRACKED_TRADE_TYPES=new Set(['buy','sell','swap']);
function isTrackedTradeActivity(activity){
  if(!activity?.mint)return false;
  const type=String(activity.type||'').toLowerCase();
  if(!TRACKED_TRADE_TYPES.has(type))return false;
  return Math.abs(Number(activity.tokenAmount||0))>1e-12;
}
/* SHADOW_TRADE_ONLY_V239_LIVE_END */

export function createLiveIntelligence(db,{fetchImpl=fetch}={}) {
  /* SHADOW_REALTIME_HELIUS_V300 */
  let timer=null, realtimeTimer=null, running=false, lastCycleAt='', lastError='', cycleCount=0;
  let webhookQueue=[];
  let webhookProcessing=false;
  let realtime={
    configured:!!process.env.HELIUS_API_KEY,
    active:false,
    webhookId:String(getSetting(db,'helius_webhook_id','')||''),
    url:'',
    addressCount:0,
    lastConfigAt:'',
    lastDeliveryAt:'',
    lastProcessedAt:'',
    lastError:'',
    queueDepth:0
  };
  let solanaHealthSnapshot={at:0,value:null};

  function setInternalSetting(key,value){
    db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value??''));
  }

  function normalizeBaseUrl(value){
    let v=String(value||'').trim();
    if(!v)return '';
    if(!/^https?:\/\//i.test(v))v=`https://${v}`;
    return v.replace(/\/+$/,'');
  }

  function publicBaseUrl(){
    const explicit=normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
    if(explicit)return explicit;
    const dev=normalizeBaseUrl(process.env.REPLIT_DEV_DOMAIN);
    if(dev)return dev;
    const domains=String(process.env.REPLIT_DOMAINS||'').split(',').map(x=>normalizeBaseUrl(x)).filter(Boolean);
    return domains[0]||'';
  }

  function webhookAuthValue(){
    let secret=String(getSetting(db,'helius_webhook_secret','')||'').trim();
    if(!secret){
      secret=crypto.randomBytes(32).toString('hex');
      setInternalSetting('helius_webhook_secret',secret);
    }
    return `Bearer ${secret}`;
  }

  function webhookAuthorized(value){
    const expected=Buffer.from(webhookAuthValue());
    const actual=Buffer.from(String(value||''));
    return expected.length===actual.length && crypto.timingSafeEqual(expected,actual);
  }

  function isRateLimitedError(error){
    const text=String(error?.message||error||'');
    return error?.status===429 || error?.code==='RATE_LIMITED' || /\b429\b|rate.?limit/i.test(text);
  }

  async function heliusWebhookRequest(method,suffix='',body=null){
    const key=String(process.env.HELIUS_API_KEY||'').trim();
    if(!key)throw new Error('HELIUS_API_KEY not configured');
    const url=`https://api-mainnet.helius-rpc.com/v0/webhooks${suffix}?api-key=${encodeURIComponent(key)}`;
    let lastError;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetchImpl(url,{
          method,
          headers:{'content-type':'application/json',accept:'application/json'},
          body:body==null?undefined:JSON.stringify(body),
          signal:AbortSignal.timeout(12000)
        });
        if(response.ok){
          if(response.status===204)return {};
          const text=await response.text();
          return text?JSON.parse(text):{};
        }
        const error=new Error(`Helius webhook HTTP ${response.status}`);
        error.status=response.status;
        if(response.status===429)error.code='RATE_LIMITED';
        if(response.status!==429 || attempt===2)throw error;
        const retryAfter=Number(response.headers?.get?.('retry-after'));
        await sleep(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,10000):1500*(attempt+1));
      }catch(error){
        lastError=error;
        if(!isRateLimitedError(error) || attempt===2)throw error;
        await sleep(1500*(attempt+1));
      }
    }
    throw lastError||new Error('Helius webhook request failed');
  }

  async function refreshRealtimeWebhook(){
    realtime.configured=!!process.env.HELIUS_API_KEY;
    const base=publicBaseUrl();
    const addresses=db.prepare('SELECT address FROM wallets WHERE monitoring_enabled=1 ORDER BY created_at').all().map(x=>String(x.address||'')).filter(isSolanaAddress);
    realtime.addressCount=addresses.length;
    realtime.url=base?`${base}/api/webhooks/helius`:'';

    if(!realtime.configured){
      realtime.active=false;
      realtime.lastError='HELIUS_API_KEY not configured';
      return {...realtime};
    }
    if(!base){
      realtime.active=false;
      realtime.lastError='Public base URL unavailable';
      return {...realtime};
    }
    if(!addresses.length){
      realtime.active=false;
      realtime.lastError='No monitored wallets';
      return {...realtime};
    }

    const payload={
      webhookURL:realtime.url,
      transactionTypes:['ANY'],
      accountAddresses:addresses,
      webhookType:'enhanced',
      authHeader:webhookAuthValue(),
      encoding:'jsonParsed'
    };

    let webhookId=String(getSetting(db,'helius_webhook_id','')||'').trim();
    try{
      let result=null;
      if(webhookId){
        try{
          result=await heliusWebhookRequest('PUT',`/${encodeURIComponent(webhookId)}`,payload);
        }catch(error){
          if(error?.status!==404)throw error;
          webhookId='';
          setInternalSetting('helius_webhook_id','');
        }
      }
      if(!webhookId){
        result=await heliusWebhookRequest('POST','',payload);
        webhookId=String(result?.webhookID||'').trim();
        if(!webhookId)throw new Error('Helius webhook did not return webhookID');
        setInternalSetting('helius_webhook_id',webhookId);
      }

      realtime={...realtime,active:true,webhookId,lastConfigAt:nowIso(),lastError:''};
      db.prepare("UPDATE wallets SET sync_status='watching',sync_error='' WHERE monitoring_enabled=1 AND sync_error LIKE '%429%'").run();
      scheduleNext();
      return {...realtime};
    }catch(error){
      // If a previously-created webhook exists, keep treating it as active during a
      // temporary management API rate-limit. This avoids falling back to aggressive polling.
      const keepActive=!!webhookId && isRateLimitedError(error);
      realtime={...realtime,active:keepActive,webhookId,lastConfigAt:nowIso(),lastError:String(error?.message||error)};
      scheduleNext();
      return {...realtime};
    }
  }

  async function ingestWebhookBatch(events){
    const rows=(Array.isArray(events)?events:[]).filter(x=>x&&typeof x==='object');
    if(!rows.length)return {events:0,matched:0,inserted:0};
    const wallets=db.prepare('SELECT * FROM wallets WHERE monitoring_enabled=1').all();
    let matched=0,inserted=0;
    let solUsd=0;

    for(const event of rows){
      for(const wallet of wallets){
        const activities=normalizeHeliusTransaction(event,wallet.address);
        if(!activities.length)continue;
        matched++;
        let walletInserted=0;

        for(const activity of activities){
          if(!isTrackedTradeActivity(activity))continue;
          if(Math.abs(Number(activity?.solAmount||0))>1e-12 && !(Number(activity?.tradeUsd||0)>0)){
            if(!(solUsd>0))solUsd=await currentSolUsdForTrade();
            if(solUsd>0){
              const sol=Math.abs(Number(activity.solAmount||0));
              activity.quoteAsset=activity.quoteAsset||'SOL';
              activity.quoteAmount=Number(activity.quoteAmount||0)||sol;
              activity.tradeUsd=sol*solUsd;
              activity.tradeUsdSource='sol-live-webhook';
            }
          }
          let token=null;
          try{token=await ensureToken(activity.mint)}catch(error){
            console.warn('Webhook token hydration failed:',String(error?.message||error));
            token=db.prepare('SELECT * FROM tokens WHERE mint=?').get(activity.mint)||null;
          }
          if(insertActivity(wallet,activity,token)){
            inserted++;
            walletInserted++;
          }
        }

        if(walletInserted){
          rebuildTradeHoldingsSnapshot(wallet);
          recomputeEntity(wallet.entity_id);
          db.prepare("UPDATE wallets SET last_scanned_at=?,sync_status='live',sync_error='' WHERE id=?").run(nowIso(),wallet.id);
        }
      }
    }

    realtime.lastDeliveryAt=nowIso();
    realtime.lastProcessedAt=nowIso();
    return {events:rows.length,matched,inserted};
  }

  async function drainWebhookQueue(){
    if(webhookProcessing)return;
    webhookProcessing=true;
    try{
      while(webhookQueue.length){
        const batch=webhookQueue.splice(0,25);
        realtime.queueDepth=webhookQueue.length;
        try{await ingestWebhookBatch(batch)}catch(error){
          realtime.lastError=String(error?.message||error);
          console.error('Helius webhook processing failed:',error);
        }
      }
    }finally{
      webhookProcessing=false;
      realtime.queueDepth=webhookQueue.length;
    }
  }

  function enqueueWebhook(payload){
    const items=(Array.isArray(payload)?payload:[payload]).filter(x=>x&&typeof x==='object');
    realtime.lastDeliveryAt=nowIso();
    if(!items.length)return {accepted:0,queueDepth:webhookQueue.length};
    webhookQueue.push(...items.slice(0,500));
    if(webhookQueue.length>2000)webhookQueue=webhookQueue.slice(-2000);
    realtime.queueDepth=webhookQueue.length;
    setImmediate(()=>drainWebhookQueue());
    return {accepted:items.length,queueDepth:webhookQueue.length};
  }

  async function cachedSolanaHealth(){
    const now=Date.now();
    if(solanaHealthSnapshot.value && now-solanaHealthSnapshot.at<30000)return solanaHealthSnapshot.value;
    const value=await solanaHealth({fetchImpl});
    solanaHealthSnapshot={at:now,value};
    return value;
  }
  /* SHADOW_STABLE_QUOTE_V2413_LIVE */
  let solUsdSnapshot={value:0,at:0};
  async function currentSolUsdForTrade(){
    const now=Date.now();
    if(solUsdSnapshot.value>0 && now-solUsdSnapshot.at<60000)return solUsdSnapshot.value;
    try{
      const market=await getTokenMarket(WSOL_MINT,{fetchImpl});
      const value=Number(market?.priceUsd||0);
      if(Number.isFinite(value)&&value>0)solUsdSnapshot={value,at:now};
    }catch{}
    return solUsdSnapshot.value||0;
  }
  /* SHADOW_STABLE_QUOTE_V2413_LIVE_END */

  async function ensureToken(mint,{force=false}={}) {
    if(!mint)return null;
    let row=db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint);
    if(row && !force && tokenCacheFresh(row))return row;
    const market=await getTokenMarket(mint,{fetchImpl});
    const now=nowIso();
    if(!row){
      const tokenId=id('tok_');
      db.prepare(`INSERT INTO tokens (id,symbol,name,mint,image,price_change,created_at,price_usd,market_cap,liquidity_usd,dex_id,external_url,last_market_at,is_pump)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          tokenId,market?.symbol||`$${mint.slice(0,4)}`,market?.name||mint.slice(0,8),mint,market?.image||'',market?.priceChange||0,now,
          market?.priceUsd||0,market?.marketCap||0,market?.liquidityUsd||0,market?.dexId||'',market?.externalUrl||'',now,market?.isPump?1:0
        );
      row=db.prepare('SELECT * FROM tokens WHERE id=?').get(tokenId);
    } else if(market){
      db.prepare(`UPDATE tokens SET symbol=?,name=?,image=CASE WHEN ?<>'' THEN ? ELSE image END,price_change=?,price_usd=?,market_cap=?,liquidity_usd=?,dex_id=?,external_url=?,last_market_at=?,is_pump=? WHERE id=?`).run(
        market.symbol,market.name,market.image,market.image,market.priceChange,market.priceUsd,market.marketCap,market.liquidityUsd,market.dexId,market.externalUrl,now,market.isPump?1:row.is_pump,row.id
      );
      row=db.prepare('SELECT * FROM tokens WHERE id=?').get(row.id);
    } else if(row && !market) {
      db.prepare('UPDATE tokens SET last_market_at=? WHERE id=?').run(now,row.id);
      row=db.prepare('SELECT * FROM tokens WHERE id=?').get(row.id);
    }
    if(row && market){
      db.prepare('INSERT INTO market_snapshots (id,token_id,price_usd,price_change,market_cap,liquidity_usd,created_at) VALUES (?,?,?,?,?,?,?)').run(id('mkt_'),row.id,market.priceUsd,market.priceChange,market.marketCap,market.liquidityUsd,now);
      db.prepare('DELETE FROM market_snapshots WHERE token_id=? AND id NOT IN (SELECT id FROM market_snapshots WHERE token_id=? ORDER BY created_at DESC LIMIT 200)').run(row.id,row.id);
    }
    return row;
  }

  function insertActivity(wallet,activity,token) {
    if(!isTrackedTradeActivity(activity))return false;
    const eventKey=`chain:${wallet.id}:${activity.signature}:${activity.mint}:${activity.type}`;
    const exists=db.prepare('SELECT id FROM wallet_activity WHERE event_key=?').get(eventKey);
    if(exists)return false;
    const blockIso=isoFromUnix(activity.blockTime);
    const isPump=activity.isPump || !!token?.is_pump;

    const quoteAsset=String(activity.quoteAsset||'').trim();
    const quoteAmount=Math.abs(Number(activity.quoteAmount||0));
    const tradeUsd=Math.abs(Number(activity.tradeUsd||0));
    const tradeUsdSource=String(activity.tradeUsdSource||'').trim();

    db.prepare(`INSERT INTO wallet_activity (
      id,event_key,wallet_id,entity_id,signature,slot,block_time,type,source,description,
      mint,token_symbol,token_name,token_amount,sol_amount,price_usd,price_change,is_pump,
      quote_asset,quote_amount,trade_usd,trade_usd_source,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id('act_'),eventKey,wallet.id,wallet.entity_id,activity.signature,activity.slot||0,blockIso,activity.type,activity.source||'solana',activity.description||'',activity.mint,
      token?.symbol||`$${activity.mint.slice(0,4)}`,token?.name||activity.mint.slice(0,8),activity.tokenAmount||0,activity.solAmount||0,token?.price_usd||0,token?.price_change||0,isPump?1:0,
      quoteAsset,quoteAmount,tradeUsd,tradeUsdSource,nowIso()
    );

    const symbol=token?.symbol||`$${activity.mint.slice(0,4)}`;
    const amount=Math.abs(Number(activity.tokenAmount||0));
    const sol=Math.abs(Number(activity.solAmount||0));
    const title=activity.type==='buy'
      ?`Bought ${symbol}`
      :activity.type==='sell'
        ?`Sold ${symbol}`
        :`Swapped into ${symbol}`;
    const sourceLabel=isPump?(String(activity.source).toLowerCase().includes('swap')?'PumpSwap':'Pump.fun'):(activity.source||'Solana');
    const quoteText=tradeUsd>0
      ? `$${tradeUsd.toLocaleString(undefined,{maximumFractionDigits:2})}`
      : sol
        ? `${sol.toFixed(4)} SOL`
        : '';
    const detail=[amount?`${amount.toLocaleString(undefined,{maximumFractionDigits:4})} ${symbol}`:'',quoteText,sourceLabel,activity.signature?`${activity.signature.slice(0,6)}...${activity.signature.slice(-6)}`:''].filter(Boolean).join(' · ');
    db.prepare(`INSERT OR IGNORE INTO incidents (id,entity_id,wallet_id,token_id,type,title,detail,severity,value,created_at,source_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      id('inc_'),wallet.entity_id,wallet.id,token?.id||null,activity.type,title,detail,activity.type==='sell'?'watch':'info',token?.price_change||null,blockIso,eventKey
    );
    return true;
  }

  /* SHADOW_CURRENT_HOLDINGS_V219_LIVE */
  function saveWalletHoldingsSnapshot(wallet,holdings=[]) {
    const at=nowIso();
    const cleanRows=(Array.isArray(holdings)?holdings:[])
      .filter(h=>h?.mint&&Number(h.amount)>1e-12);

    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('DELETE FROM wallet_holdings WHERE wallet_id=?').run(wallet.id);
      const insert=db.prepare(`
        INSERT INTO wallet_holdings
          (wallet_id,entity_id,mint,amount,decimals,updated_at)
        VALUES (?,?,?,?,?,?)
      `);

      for(const h of cleanRows){
        insert.run(
          wallet.id,
          wallet.entity_id||null,
          String(h.mint),
          Number(h.amount),
          Math.max(0,Number(h.decimals)||0),
          at
        );
      }

      db.prepare(`
        INSERT INTO wallet_holdings_state
          (wallet_id,last_success_at,last_attempt_at,sync_status,sync_error)
        VALUES (?,?,?,'live','')
        ON CONFLICT(wallet_id) DO UPDATE SET
          last_success_at=excluded.last_success_at,
          last_attempt_at=excluded.last_attempt_at,
          sync_status='live',
          sync_error=''
      `).run(wallet.id,at,at);

      db.exec('COMMIT');
    }catch(error){
      try{db.exec('ROLLBACK')}catch{}
      throw error;
    }

    return {count:cleanRows.length,updatedAt:at};
  }

  function rebuildTradeHoldingsSnapshot(wallet) {
    const rows=db.prepare(`
      SELECT mint,
        SUM(CASE WHEN type IN ('buy','swap') THEN ABS(COALESCE(token_amount,0)) ELSE 0 END) AS bought,
        SUM(CASE WHEN type='sell' THEN ABS(COALESCE(token_amount,0)) ELSE 0 END) AS sold
      FROM wallet_activity
      WHERE wallet_id=? AND mint<>'' AND type IN ('buy','sell','swap')
      GROUP BY mint
      HAVING SUM(CASE WHEN type IN ('buy','swap') THEN ABS(COALESCE(token_amount,0)) ELSE 0 END)>1e-12
    `).all(wallet.id);

    const positions=rows
      .map(row=>({
        mint:String(row.mint||''),
        amount:Math.max(0,Number(row.bought||0)-Number(row.sold||0)),
        decimals:0
      }))
      .filter(row=>row.mint&&row.amount>1e-12);

    return saveWalletHoldingsSnapshot(wallet,positions);
  }

  function markWalletHoldingsError(wallet,error) {
    const at=nowIso();
    db.prepare(`
      INSERT INTO wallet_holdings_state
        (wallet_id,last_success_at,last_attempt_at,sync_status,sync_error)
      VALUES (?,'',?,'error',?)
      ON CONFLICT(wallet_id) DO UPDATE SET
        last_attempt_at=excluded.last_attempt_at,
        sync_status='error',
        sync_error=excluded.sync_error
    `).run(wallet.id,at,String(error?.message||error).slice(0,300));
  }
  /* SHADOW_CURRENT_HOLDINGS_V219_LIVE_END */

  async function syncWallet(walletId,{forceMarket=false}={}) {
    const wallet=db.prepare('SELECT * FROM wallets WHERE id=?').get(walletId);
    if(!wallet)throw new Error('Wallet not found');
    if(!isSolanaAddress(wallet.address)){
      db.prepare("UPDATE wallets SET sync_status='error',sync_error=?,last_scanned_at=? WHERE id=?").run('Invalid Solana wallet address',nowIso(),wallet.id);
      throw new Error('Invalid Solana wallet address');
    }
    db.prepare("UPDATE wallets SET sync_status='syncing',sync_error='' WHERE id=?").run(wallet.id);
    try{
      // Raw SPL balances are not trusted as positions: anyone can send tokens
      // to a public wallet. Current holdings are derived from actual trades only.
      let holdingsSnapshot={ok:true,provider:'trade-ledger',count:0};

      const configuredLimit=Math.max(5,Math.min(Number(getSetting(db,'wallet_history_limit','30'))||30,100));
      const limit=wallet.last_signature?configuredLimit:100;
      const result=await getRecentWalletActivity(wallet.address,{limit,untilSignature:wallet.last_signature||'',fetchImpl});

      const needsSolUsd=result.activity.some(a=>
        Math.abs(Number(a?.solAmount||0))>1e-12 && !(Number(a?.tradeUsd||0)>0)
      );
      const solUsd=needsSolUsd?await currentSolUsdForTrade():0;
      if(solUsd>0){
        for(const activity of result.activity){
          if(Number(activity?.tradeUsd||0)>0)continue;
          const sol=Math.abs(Number(activity?.solAmount||0));
          if(sol<=1e-12)continue;
          activity.quoteAsset=activity.quoteAsset||'SOL';
          activity.quoteAmount=Number(activity.quoteAmount||0)||sol;
          activity.tradeUsd=sol*solUsd;
          activity.tradeUsdSource=wallet.last_signature?'sol-live':'sol-backfill-estimate';
        }
      }

      let inserted=0;
      const tokenByMint=new Map();
      for(const activity of result.activity){
        if(!isTrackedTradeActivity(activity))continue;
        let token=tokenByMint.get(activity.mint);
        if(!token){
          token=await ensureToken(activity.mint,{force:forceMarket});
          tokenByMint.set(activity.mint,token);
        }
        if(insertActivity(wallet,activity,token))inserted++;
      }

      const savedHoldings=rebuildTradeHoldingsSnapshot(wallet);
      holdingsSnapshot={
        ok:true,
        provider:'trade-ledger',
        count:savedHoldings.count,
        updatedAt:savedHoldings.updatedAt
      };

      const newest=result.signatures?.[0]||wallet.last_signature||'';
      db.prepare("UPDATE wallets SET last_signature=?,last_scanned_at=?,sync_status='live',sync_error='' WHERE id=?").run(newest,nowIso(),wallet.id);
      recomputeEntity(wallet.entity_id);
      return {ok:true,provider:result.provider,newTransactions:result.signatures?.length||0,newActivity:inserted,lastSignature:newest,holdings:holdingsSnapshot};
    }catch(error){
      const message=String(error?.message||error).slice(0,300);
      const status=isRateLimitedError(error)?'rate_limited':'error';
      db.prepare("UPDATE wallets SET last_scanned_at=?,sync_status=?,sync_error=? WHERE id=?").run(nowIso(),status,message,wallet.id);
      throw error;
    }
  }

  function resolvePostToken(entityId,mint,symbol){
    if(mint)return db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint)||null;
    if(!symbol)return null;
    const wanted=upperSymbol(symbol);
    const rows=db.prepare(`SELECT DISTINCT t.* FROM tokens t JOIN wallet_activity a ON a.mint=t.mint WHERE a.entity_id=? AND UPPER(REPLACE(t.symbol,'$',''))=? ORDER BY a.block_time DESC LIMIT 2`).all(entityId,wanted);
    return rows.length===1?rows[0]:null;
  }

  function correlateEntity(entityId){
    const posts=db.prepare("SELECT * FROM social_posts WHERE entity_id=? ORDER BY posted_at").all(entityId);
    for(const post of posts){
      const token=resolvePostToken(entityId,post.token_mint,post.token_symbol); if(!token)continue;
      if(!post.token_mint)db.prepare('UPDATE social_posts SET token_mint=? WHERE id=?').run(token.mint,post.id);
      const at=new Date(post.posted_at).getTime();
      const before=new Date(at-48*3600e3).toISOString(); const after=new Date(at+48*3600e3).toISOString();
      const buy=db.prepare("SELECT * FROM wallet_activity WHERE entity_id=? AND mint=? AND type IN ('buy','swap') AND block_time BETWEEN ? AND ? ORDER BY block_time DESC LIMIT 1").get(entityId,token.mint,before,post.posted_at);
      const sell=db.prepare("SELECT * FROM wallet_activity WHERE entity_id=? AND mint=? AND type='sell' AND block_time BETWEEN ? AND ? ORDER BY block_time ASC LIMIT 1").get(entityId,token.mint,post.posted_at,after);
      if(!buy||!sell)continue;
      const sourceKey=`correlation:${post.id}:${token.mint}`;
      const detail=`Observed sequence: wallet bought before the X post and sold afterward. This is an on-chain/social correlation, not a legal determination of wrongdoing.`;
      db.prepare(`INSERT OR IGNORE INTO incidents (id,entity_id,wallet_id,token_id,type,title,detail,severity,value,created_at,source_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        id('inc_'),entityId,buy.wallet_id,token.id,'correlation',`Promotion → exit pattern: ${token.symbol}`,detail,'high',token.price_change||null,sell.block_time||nowIso(),sourceKey
      );
    }
  }

  function recomputeEntity(entityId){
    if(!entityId)return;
    correlateEntity(entityId);
    const total=db.prepare('SELECT COUNT(*) AS n FROM incidents WHERE entity_id=?').get(entityId).n;
    const correlations=db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE entity_id=? AND type='correlation'").get(entityId).n;
    const pumpTrades=db.prepare("SELECT COUNT(DISTINCT mint) AS n FROM wallet_activity WHERE entity_id=? AND is_pump=1 AND type IN ('buy','sell','swap')").get(entityId).n;
    const risk=Math.min(100,correlations*25 + (correlations>=2?10:0) + (correlations>=3&&pumpTrades>=3?10:0));
    const status=risk>=80?'high':risk>=40?'watch':'monitoring';
    db.prepare('UPDATE entities SET incidents=?,risk_score=?,status=? WHERE id=?').run(total,risk,status,entityId);
  }

  async function syncXEntity(entityId){
    const entity=db.prepare('SELECT * FROM entities WHERE id=?').get(entityId); if(!entity)throw new Error('Entity not found');
    if(!xConfigured()||!entity.x_handle)return {ok:false,configured:xConfigured(),skipped:true};
    try{
      const profile=await getXProfile(entity.x_handle,{fetchImpl});
      if(!profile)throw new Error('X profile not found');
      if(entity.avatar_source!=='manual' && profile.profile_image_url) db.prepare("UPDATE entities SET avatar=?,avatar_source='x' WHERE id=?").run(String(profile.profile_image_url).replace('_normal','_400x400'),entity.id);
      db.prepare('UPDATE entities SET x_user_id=? WHERE id=?').run(profile.id||'',entity.id);
      const posts=await getXPosts(profile.id,{sinceId:entity.x_last_post_id||'',limit:10,fetchImpl});
      let newest=entity.x_last_post_id||'',inserted=0;
      for(const post of posts.slice().reverse()){
        newest=posts[0]?.id||newest;
        const mint=extractSolanaMint(post.text); const symbol=extractSymbol(post.text);
        const token=mint?await ensureToken(mint):resolvePostToken(entity.id,'',symbol);
        const url=`https://x.com/${String(entity.x_handle).replace(/^@/,'')}/status/${post.id}`;
        const result=db.prepare(`INSERT OR IGNORE INTO social_posts (id,entity_id,external_id,source,text,url,token_mint,token_symbol,posted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          id('post_'),entity.id,`x:${post.id}`,'x',String(post.text||'').slice(0,1200),url,token?.mint||mint,token?.symbol||symbol,post.created_at||nowIso(),nowIso()
        );
        if(result.changes){
          inserted++;
          db.prepare(`INSERT OR IGNORE INTO incidents (id,entity_id,wallet_id,token_id,type,title,detail,severity,value,created_at,source_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
            id('inc_'),entity.id,null,token?.id||null,'social','X post detected',String(post.text||'').slice(0,260),'info',token?.price_change||null,post.created_at||nowIso(),`x:${post.id}`
          );
        }
      }
      db.prepare("UPDATE entities SET x_last_post_id=?,x_last_synced_at=? WHERE id=?").run(newest,nowIso(),entity.id);
      recomputeEntity(entity.id);
      return {ok:true,configured:true,newPosts:inserted,profile:{id:profile.id,username:profile.username,followers:profile.public_metrics?.followers_count||0}};
    }catch(error){
      db.prepare('UPDATE entities SET x_last_synced_at=? WHERE id=?').run(nowIso(),entity.id);
      throw error;
    }
  }

  async function syncEntity(entityId){
    const wallets=db.prepare('SELECT id FROM wallets WHERE entity_id=? AND monitoring_enabled=1 ORDER BY created_at').all(entityId);
    const walletResults=[];
    for(const w of wallets){try{walletResults.push(await syncWallet(w.id));}catch(error){walletResults.push({ok:false,error:error.message});}}
    let xResult={ok:false,configured:xConfigured(),skipped:true};
    if(getSetting(db,'x_monitor_enabled','true')==='true')try{xResult=await syncXEntity(entityId);}catch(error){xResult={ok:false,configured:xConfigured(),error:error.message};}
    recomputeEntity(entityId);
    return {ok:walletResults.some(x=>x.ok)||xResult.ok,wallets:walletResults,x:xResult};
  }

  async function syncAll(){
    if(running)return {ok:false,busy:true}; running=true; lastError='';
    const started=Date.now(); let wallets=0,failures=0,xEntities=0,rateLimited=false;
    try{
      const rows=db.prepare('SELECT id FROM wallets WHERE monitoring_enabled=1 ORDER BY COALESCE(last_scanned_at,\'\'),created_at LIMIT 200').all();
      for(const w of rows){
        try{await syncWallet(w.id);wallets++;}
        catch(error){
          failures++;
          if(isRateLimitedError(error)){
            rateLimited=true;
            lastError=String(error?.message||error);
            break;
          }
        }
        await sleep(350);
      }
      if(!rateLimited && getSetting(db,'x_monitor_enabled','true')==='true'&&xConfigured()){
        const entities=db.prepare("SELECT id FROM entities WHERE x_handle<>'' ORDER BY COALESCE(x_last_synced_at,''),created_at LIMIT 100").all();
        for(const e of entities){try{await syncXEntity(e.id);xEntities++;}catch{failures++;} await sleep(150);}
      }
      lastCycleAt=nowIso(); cycleCount++;
      return {ok:true,wallets,xEntities,failures,rateLimited,durationMs:Date.now()-started};
    }catch(error){lastError=error.message;throw error;}finally{running=false;}
  }

  function reconciliationSeconds(){
    if(realtime.active)return 3600; // Webhook is primary; hourly scan is only a safety net.
    return Math.max(300,Math.min(Number(getSetting(db,'live_poll_seconds','60'))||60,3600));
  }

  function scheduleNext(){
    if(timer)clearTimeout(timer);
    const seconds=reconciliationSeconds();
    timer=setTimeout(async()=>{
      if(getSetting(db,'live_monitor_enabled','true')==='true'){
        try{await syncAll()}catch(error){lastError=error.message}
      }
      scheduleNext();
    },seconds*1000);
    timer.unref?.();
  }

  function scheduleRealtimeRefresh(delayMs=null){
    if(realtimeTimer)clearTimeout(realtimeTimer);
    const wait=delayMs==null?(realtime.active?300000:60000):delayMs;
    realtimeTimer=setTimeout(async()=>{
      try{await refreshRealtimeWebhook()}catch(error){realtime.lastError=String(error?.message||error)}
      scheduleRealtimeRefresh();
    },wait);
    realtimeTimer.unref?.();
  }

  function start(){
    // Existing webhook ID is treated as provisionally active until refresh confirms it.
    if(process.env.HELIUS_API_KEY && realtime.webhookId && publicBaseUrl())realtime.active=true;
    scheduleNext();
    scheduleRealtimeRefresh(1200);
    setTimeout(()=>{
      if(getSetting(db,'live_monitor_enabled','true')!=='true')return;
      // Reconciliation is intentionally delayed. Realtime webhook delivery does not wait for it.
      syncAll().catch(e=>{lastError=e.message});
    },realtime.active?90000:300000).unref?.();
  }

  function stop(){
    if(timer)clearTimeout(timer);
    if(realtimeTimer)clearTimeout(realtimeTimer);
    timer=null;
    realtimeTimer=null;
  }

  async function health(){
    return {
      worker:{running,lastCycleAt,lastError,cycleCount,enabled:getSetting(db,'live_monitor_enabled','true')==='true',reconciliationSeconds:reconciliationSeconds()},
      realtime:{...realtime,queueDepth:webhookQueue.length,processing:webhookProcessing},
      solana:await cachedSolanaHealth(),
      x:{configured:xConfigured(),enabled:getSetting(db,'x_monitor_enabled','true')==='true'}
    };
  }

  return {start,stop,syncWallet,syncEntity,syncXEntity,syncAll,ensureToken,recomputeEntity,health,refreshRealtimeWebhook,enqueueWebhook,webhookAuthorized};
}
