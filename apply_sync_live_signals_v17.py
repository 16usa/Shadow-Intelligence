#!/usr/bin/env python3
from pathlib import Path
import shutil, sys

ROOT=Path.cwd()
SERVER=ROOT/"server.mjs"
SYNC=ROOT/"public/sync.js"
MARKER="SYNC_LIVE_SIGNALS_SSE_V17"

if not SERVER.is_file() or not SYNC.is_file():
    raise SystemExit("ERROR: run from ~/workspace; server.mjs or public/sync.js not found")

server=SERVER.read_text()
sync=SYNC.read_text()

if MARKER in server and MARKER in sync:
    print("SYNC LIVE SIGNALS V17 ALREADY INSTALLED")
    raise SystemExit(0)

server_bak=ROOT/"server.mjs.bak-live-signals-v17"
sync_bak=ROOT/"public/sync.js.bak-live-signals-v17"
shutil.copy2(SERVER,server_bak)
shutil.copy2(SYNC,sync_bak)

try:
    old_live="""  const internalCopyEngine=createInternalCopyEngine(db,{fetchImpl});
  globalThis.__SHADOW_INTERNAL_COPY_ENGINE=internalCopyEngine;
  globalThis.__SHADOW_INTERNAL_COPY_ENGINE_SYNC=payload=>internalCopyEngine.syncSubscription(payload);
  const live=createLiveIntelligence(db,{
    fetchImpl,
    onFastTrade:event=>internalCopyEngine.handleTradeEvent?.(event)
  });"""

    new_live="""  const internalCopyEngine=createInternalCopyEngine(db,{fetchImpl});
  globalThis.__SHADOW_INTERNAL_COPY_ENGINE=internalCopyEngine;
  globalThis.__SHADOW_INTERNAL_COPY_ENGINE_SYNC=payload=>internalCopyEngine.syncSubscription(payload);

  /* SYNC_LIVE_SIGNALS_SSE_V17 */
  const syncLiveSignalClients=new Set();

  function syncPublicSignalRow(event){
    const leaderId=String(getSetting(db,'public_copy_leader_entity_id',process.env.PUBLIC_COPY_LEADER_ENTITY_ID||'')||'').trim();
    if(!leaderId || String(event?.entityId||'')!==leaderId)return null;
    const mainWallet=mainCopyWalletRows(db,leaderId)[0]||null;
    if(!mainWallet || String(event?.sourceWalletId||'')!==String(mainWallet.id||''))return null;

    const row=db.prepare(
      "SELECT a.id,a.type,a.signature,a.mint AS tokenMint,"+
      "ABS(COALESCE(a.trade_usd,0)) AS tradeUsd,"+
      "ABS(COALESCE(a.sol_amount,0)) AS solAmount,"+
      "COALESCE(NULLIF(a.block_time,''),a.created_at) AS eventAt,"+
      "COALESCE(t.symbol,a.token_symbol,'') AS symbol,"+
      "COALESCE(t.name,a.token_name,'') AS tokenName,"+
      "COALESCE(t.image,'') AS tokenImage,"+
      "COALESCE(t.market_cap,0) AS marketCap "+
      "FROM wallet_activity a LEFT JOIN tokens t ON t.mint=a.mint "+
      "WHERE a.entity_id=? AND a.wallet_id=? AND a.signature=? AND a.mint=? "+
      "ORDER BY COALESCE(NULLIF(a.block_time,''),a.created_at) DESC LIMIT 1"
    ).get(leaderId,mainWallet.id,String(event?.signature||''),String(event?.mint||''));

    if(!row)return {
      id:`live:${String(event?.signature||'')}:${String(event?.mint||'')}`,
      type:String(event?.side||'buy'),
      side:String(event?.side||'buy')==='sell'?'sell':'buy',
      signature:String(event?.signature||''),
      tokenMint:String(event?.mint||''),
      symbol:'',
      tokenName:'',
      tokenImage:'',
      tradeUsd:0,
      solAmount:Math.abs(Number(event?.solAmount||0)),
      marketCap:Math.max(0,Number(event?.cachedMarketCapUsd||0)),
      eventAt:new Date().toISOString()
    };

    return {...row,side:String(row.type||'').toLowerCase()==='sell'?'sell':'buy'};
  }

  function broadcastSyncLiveSignal(event){
    const row=syncPublicSignalRow(event);
    if(!row)return;
    const packet=`event: trade\\ndata: ${JSON.stringify(row)}\\n\\n`;
    for(const res of [...syncLiveSignalClients]){
      try{res.write(packet)}catch{syncLiveSignalClients.delete(res)}
    }
  }

  const live=createLiveIntelligence(db,{
    fetchImpl,
    onFastTrade:async event=>{
      // UI gets the Helius event immediately. Copy execution stays on the same hot path.
      broadcastSyncLiveSignal(event);
      return await internalCopyEngine.handleTradeEvent?.(event);
    }
  });
  /* SYNC_LIVE_SIGNALS_SSE_V17_END */"""

    if old_live not in server:
        raise RuntimeError("server live-engine anchor not found")
    server=server.replace(old_live,new_live,1)

    old_recent="""    const recent=db.prepare(
      "SELECT a.id,a.type,a.signature,a.mint AS tokenMint,"+
      "ABS(COALESCE(a.trade_usd,0)) AS tradeUsd,"+
      "ABS(COALESCE(a.sol_amount,0)) AS solAmount,"+
      "COALESCE(NULLIF(a.block_time,''),a.created_at) AS eventAt,"+
      "COALESCE(t.symbol,a.token_symbol,'') AS symbol,"+
      "COALESCE(t.name,a.token_name,'') AS tokenName,"+
      "COALESCE(t.image,'') AS tokenImage,"+
      "COALESCE(t.market_cap,0) AS marketCap "+
      "FROM wallet_activity a LEFT JOIN tokens t ON t.mint=a.mint "+
      "WHERE a.entity_id=? AND a.wallet_id=? AND a.type IN ('buy','sell','swap') "+
      "ORDER BY COALESCE(NULLIF(a.block_time,''),a.created_at) DESC LIMIT 12"
    ).all(leader.id,mainWallet.id).map(row=>({"""

    new_recent="""    // Live signals are not a multi-day history panel. Keep only fresh activity.
    const liveSignalCutoff=new Date(Date.now()-24*60*60*1000).toISOString();
    const recent=db.prepare(
      "SELECT a.id,a.type,a.signature,a.mint AS tokenMint,"+
      "ABS(COALESCE(a.trade_usd,0)) AS tradeUsd,"+
      "ABS(COALESCE(a.sol_amount,0)) AS solAmount,"+
      "COALESCE(NULLIF(a.block_time,''),a.created_at) AS eventAt,"+
      "COALESCE(t.symbol,a.token_symbol,'') AS symbol,"+
      "COALESCE(t.name,a.token_name,'') AS tokenName,"+
      "COALESCE(t.image,'') AS tokenImage,"+
      "COALESCE(t.market_cap,0) AS marketCap "+
      "FROM wallet_activity a LEFT JOIN tokens t ON t.mint=a.mint "+
      "WHERE a.entity_id=? AND a.wallet_id=? AND a.type IN ('buy','sell','swap') "+
      "AND COALESCE(NULLIF(a.block_time,''),a.created_at)>=? "+
      "ORDER BY COALESCE(NULLIF(a.block_time,''),a.created_at) DESC LIMIT 12"
    ).all(leader.id,mainWallet.id,liveSignalCutoff).map(row=>({"""

    if old_recent not in server:
        raise RuntimeError("public room recent-query anchor not found")
    server=server.replace(old_recent,new_recent,1)

    old_http="""  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);
    }catch(err){ console.error(err); if(!res.headersSent)json(res,err.statusCode||500,{error:err.statusCode?err.message:'Internal server error'}); else res.end(); }
  });"""

    new_http="""  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);

      /* SYNC_LIVE_SIGNALS_SSE_V17_ROUTE */
      if(url.pathname==='/api/public-copy-room/events' && (req.method||'GET')==='GET'){
        res.writeHead(200,{
          'content-type':'text/event-stream; charset=utf-8',
          'cache-control':'no-cache, no-transform',
          'connection':'keep-alive',
          'x-accel-buffering':'no'
        });
        res.write('event: ready\\ndata: {}\\n\\n');
        syncLiveSignalClients.add(res);
        const ping=setInterval(()=>{
          try{res.write(': ping\\n\\n')}catch{}
        },20000);
        ping.unref?.();
        req.on('close',()=>{
          clearInterval(ping);
          syncLiveSignalClients.delete(res);
        });
        return;
      }

      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);
    }catch(err){ console.error(err); if(!res.headersSent)json(res,err.statusCode||500,{error:err.statusCode?err.message:'Internal server error'}); else res.end(); }
  });"""

    if old_http not in server:
        raise RuntimeError("HTTP server anchor not found")
    server=server.replace(old_http,new_http,1)

    old_close="""  server.on('close',()=>{ try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(profileAvatarRepairTimer)clearTimeout(profileAvatarRepairTimer); if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"""
    new_close="""  server.on('close',()=>{ for(const res of [...syncLiveSignalClients]){try{res.end()}catch{}} syncLiveSignalClients.clear(); try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(profileAvatarRepairTimer)clearTimeout(profileAvatarRepairTimer); if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"""
    if old_close not in server:
        raise RuntimeError("server close anchor not found")
    server=server.replace(old_close,new_close,1)

    sync_anchor="""  async function loadRoom(){
    try{
      state.room=await api("/api/public-copy-room/status");
      renderHero();
      renderActivity();
      renderTradeAlerts();
    }catch(error){
      toast(error.message);
    }
  }"""

    sync_insert="""  /* SYNC_LIVE_SIGNALS_SSE_V17 */
  function liveSignalKey(row){
    return String(row&&row.id||row&&row.signature||"")+":"+String(row&&row.tokenMint||"")+":"+String(row&&row.side||row&&row.type||"");
  }

  function prependLiveSignal(row){
    if(!row||!state.room)return;
    var rows=Array.isArray(state.room.recent)?state.room.recent:[];
    var key=liveSignalKey(row);
    state.room.recent=[row].concat(rows.filter(function(item){return liveSignalKey(item)!==key})).slice(0,12);
    renderActivity();
  }

  function connectLiveSignals(){
    if(!("EventSource" in window))return;
    try{
      if(state.liveSignalsSource)state.liveSignalsSource.close();
      var source=new EventSource("/api/public-copy-room/events");
      state.liveSignalsSource=source;
      source.addEventListener("trade",function(event){
        try{
          var row=JSON.parse(event.data||"{}");
          prependLiveSignal(row);
          // Background enrichment may add token name/MC/trade USD a moment later.
          setTimeout(loadRoom,700);
        }catch(error){}
      });
      window.addEventListener("beforeunload",function(){try{source.close()}catch{}},{once:true});
    }catch(error){}
  }
  /* SYNC_LIVE_SIGNALS_SSE_V17_END */

""" + sync_anchor

    if sync_anchor not in sync:
        raise RuntimeError("sync.js loadRoom anchor not found")
    sync=sync.replace(sync_anchor,sync_insert,1)

    old_boot="""  async function boot(){
    bind();
    await loadRoom();
    await loadSession();
    setInterval(loadRoom,5000);
  }"""
    new_boot="""  async function boot(){
    bind();
    await loadRoom();
    await loadSession();
    connectLiveSignals();
    // SSE is primary; polling remains only as a recovery/fallback path.
    setInterval(loadRoom,5000);
  }"""
    if old_boot not in sync:
        raise RuntimeError("sync.js boot anchor not found")
    sync=sync.replace(old_boot,new_boot,1)

    SERVER.write_text(server)
    SYNC.write_text(sync)

except Exception as e:
    shutil.copy2(server_bak,SERVER)
    shutil.copy2(sync_bak,SYNC)
    raise SystemExit(f"ERROR: {e}. Original files restored.")

print("SYNC LIVE SIGNALS V17 INSTALLED")
print("Backups:")
print(" ",server_bak)
print(" ",sync_bak)
print("Behavior:")
print("  Helius leader BUY/SELL -> immediate SSE -> Live signals")
print("  5s polling remains as fallback")
print("  signals older than 24h are hidden from Live signals")
