import { id, nowIso, isSolanaAddress } from './utils.mjs';
import { getRecentWalletActivity, getWalletTokenHoldings, solanaHealth } from './adapters/solana-rpc.mjs';
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

export function createLiveIntelligence(db,{fetchImpl=fetch}={}) {
  let timer=null, running=false, lastCycleAt='', lastError='', cycleCount=0;

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
    const eventKey=`chain:${wallet.id}:${activity.signature}:${activity.mint}:${activity.type}`;
    const exists=db.prepare('SELECT id FROM wallet_activity WHERE event_key=?').get(eventKey);
    if(exists)return false;
    const blockIso=isoFromUnix(activity.blockTime);
    const isPump=activity.isPump || !!token?.is_pump;
    db.prepare(`INSERT INTO wallet_activity (id,event_key,wallet_id,entity_id,signature,slot,block_time,type,source,description,mint,token_symbol,token_name,token_amount,sol_amount,price_usd,price_change,is_pump,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id('act_'),eventKey,wallet.id,wallet.entity_id,activity.signature,activity.slot||0,blockIso,activity.type,activity.source||'solana',activity.description||'',activity.mint,
        token?.symbol||`$${activity.mint.slice(0,4)}`,token?.name||activity.mint.slice(0,8),activity.tokenAmount||0,activity.solAmount||0,token?.price_usd||0,token?.price_change||0,isPump?1:0,nowIso()
      );
    const symbol=token?.symbol||`$${activity.mint.slice(0,4)}`;
    const amount=Math.abs(Number(activity.tokenAmount||0));
    const sol=Math.abs(Number(activity.solAmount||0));
    const title=activity.type==='buy'?`Bought ${symbol}`:activity.type==='sell'?`Sold ${symbol}`:activity.type==='swap'?`Swapped into ${symbol}`:activity.type==='receive'?`Received ${symbol}`:`Sent ${symbol}`;
    const sourceLabel=isPump?(String(activity.source).toLowerCase().includes('swap')?'PumpSwap':'Pump.fun'):(activity.source||'Solana');
    const detail=[amount?`${amount.toLocaleString(undefined,{maximumFractionDigits:4})} ${symbol}`:'',sol?`${sol.toFixed(4)} SOL`:'',sourceLabel,activity.signature?`${activity.signature.slice(0,6)}…${activity.signature.slice(-6)}`:''].filter(Boolean).join(' · ');
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
      let holdingsSnapshot={ok:false,count:0};
      try{
        const onchain=await getWalletTokenHoldings(wallet.address,{fetchImpl});
        const saved=saveWalletHoldingsSnapshot(wallet,onchain.holdings);
        holdingsSnapshot={
          ok:true,
          provider:onchain.provider,
          count:saved.count,
          updatedAt:saved.updatedAt
        };
      }catch(holdingsError){
        // Keep the previous successful snapshot on RPC failure.
        // Activity sync continues independently.
        markWalletHoldingsError(wallet,holdingsError);
        holdingsSnapshot={
          ok:false,
          error:String(holdingsError?.message||holdingsError)
        };
      }

      const limit=Math.max(5,Math.min(Number(getSetting(db,'wallet_history_limit','30'))||30,100));
      const result=await getRecentWalletActivity(wallet.address,{limit,untilSignature:wallet.last_signature||'',fetchImpl});
      let inserted=0;
      const tokenByMint=new Map();
      for(const activity of result.activity){
        let token=tokenByMint.get(activity.mint);
        if(!token){ token=await ensureToken(activity.mint,{force:forceMarket}); tokenByMint.set(activity.mint,token); }
        if(insertActivity(wallet,activity,token))inserted++;
      }
      const newest=result.signatures?.[0]||wallet.last_signature||'';
      db.prepare("UPDATE wallets SET last_signature=?,last_scanned_at=?,sync_status='live',sync_error='' WHERE id=?").run(newest,nowIso(),wallet.id);
      recomputeEntity(wallet.entity_id);
      return {ok:true,provider:result.provider,newTransactions:result.signatures?.length||0,newActivity:inserted,lastSignature:newest,holdings:holdingsSnapshot};
    }catch(error){
      db.prepare("UPDATE wallets SET last_scanned_at=?,sync_status='error',sync_error=? WHERE id=?").run(nowIso(),String(error.message||error).slice(0,300),wallet.id);
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
    const started=Date.now(); let wallets=0,failures=0,xEntities=0;
    try{
      const rows=db.prepare('SELECT id FROM wallets WHERE monitoring_enabled=1 ORDER BY COALESCE(last_scanned_at,\'\'),created_at LIMIT 200').all();
      for(const w of rows){try{await syncWallet(w.id);wallets++;}catch{failures++;} await sleep(60);}
      if(getSetting(db,'x_monitor_enabled','true')==='true'&&xConfigured()){
        const entities=db.prepare("SELECT id FROM entities WHERE x_handle<>'' ORDER BY COALESCE(x_last_synced_at,''),created_at LIMIT 100").all();
        for(const e of entities){try{await syncXEntity(e.id);xEntities++;}catch{failures++;} await sleep(60);}
      }
      lastCycleAt=nowIso(); cycleCount++;
      return {ok:true,wallets,xEntities,failures,durationMs:Date.now()-started};
    }catch(error){lastError=error.message;throw error;}finally{running=false;}
  }

  function scheduleNext(){
    if(timer)clearTimeout(timer);
    const seconds=Math.max(30,Math.min(Number(getSetting(db,'live_poll_seconds','60'))||60,3600));
    timer=setTimeout(async()=>{if(getSetting(db,'live_monitor_enabled','true')==='true')try{await syncAll();}catch(error){lastError=error.message;}scheduleNext();},seconds*1000);
    timer.unref?.();
  }
  function start(){scheduleNext();setTimeout(()=>{if(getSetting(db,'live_monitor_enabled','true')==='true')syncAll().catch(e=>{lastError=e.message;});},1500).unref?.();}
  function stop(){if(timer)clearTimeout(timer);timer=null;}
  async function health(){return {worker:{running,lastCycleAt,lastError,cycleCount,enabled:getSetting(db,'live_monitor_enabled','true')==='true'},solana:await solanaHealth({fetchImpl}),x:{configured:xConfigured(),enabled:getSetting(db,'x_monitor_enabled','true')==='true'}};}

  return {start,stop,syncWallet,syncEntity,syncXEntity,syncAll,ensureToken,recomputeEntity,health};
}
