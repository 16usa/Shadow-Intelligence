#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
SERVER=ROOT/"server.mjs"
ENGINE=ROOT/"src/internal-copy-engine.mjs"
SYNC=ROOT/"public/sync.js"
CSS=ROOT/"public/sync.css"

for p in (SERVER,ENGINE,SYNC,CSS):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

server=SERVER.read_text()
engine=ENGINE.read_text()
sync=SYNC.read_text()
css=CSS.read_text()

V17="SYNC_LIVE_SIGNALS_SSE_V17"
V18="SYNC_COPY_STATUS_LIVE_V18"

if V18 in server and V18 in engine and V18 in sync and V18 in css:
    print("SYNC COPY STATUS LIVE V18 ALREADY INSTALLED")
    raise SystemExit(0)

backups={
    SERVER:ROOT/"server.mjs.bak-copy-status-v18",
    ENGINE:ROOT/"src/internal-copy-engine.mjs.bak-copy-status-v18",
    SYNC:ROOT/"public/sync.js.bak-copy-status-v18",
    CSS:ROOT/"public/sync.css.bak-copy-status-v18",
}
for src,dst in backups.items():
    shutil.copy2(src,dst)

def require(text, needle, label):
    if needle not in text:
        raise RuntimeError(f"{label} anchor not found")
    return text

try:
    # Carry V17 inside this patch too.
    if V17 not in server:
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
      broadcastSyncLiveSignal(event);
      return await internalCopyEngine.handleTradeEvent?.(event);
    }
  });
  /* SYNC_LIVE_SIGNALS_SSE_V17_END */"""
        require(server,old_live,"V17 server live")
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
        new_recent="""    const liveSignalCutoff=new Date(Date.now()-24*60*60*1000).toISOString();
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
        require(server,old_recent,"V17 recent query")
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
        const ping=setInterval(()=>{try{res.write(': ping\\n\\n')}catch{}},20000);
        ping.unref?.();
        req.on('close',()=>{clearInterval(ping);syncLiveSignalClients.delete(res)});
        return;
      }

      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);
    }catch(err){ console.error(err); if(!res.headersSent)json(res,err.statusCode||500,{error:err.statusCode?err.message:'Internal server error'}); else res.end(); }
  });"""
        require(server,old_http,"V17 HTTP")
        server=server.replace(old_http,new_http,1)

        old_close="""  server.on('close',()=>{ try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(profileAvatarRepairTimer)clearTimeout(profileAvatarRepairTimer); if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"""
        new_close="""  server.on('close',()=>{ for(const res of [...syncLiveSignalClients]){try{res.end()}catch{}} syncLiveSignalClients.clear(); try{shadowPushStop();}catch{} try{internalCopyEngine.stop();}catch{} if(profileAvatarRepairTimer)clearTimeout(profileAvatarRepairTimer); if(tokenImageBackfillTimer)clearTimeout(tokenImageBackfillTimer); try{live.stop();}catch{} try{db.close();}catch{} });"""
        require(server,old_close,"V17 close")
        server=server.replace(old_close,new_close,1)

    if V17 not in sync:
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
          setTimeout(loadRoom,700);
        }catch(error){}
      });
      window.addEventListener("beforeunload",function(){try{source.close()}catch{}},{once:true});
    }catch(error){}
  }
  /* SYNC_LIVE_SIGNALS_SSE_V17_END */

""" + sync_anchor
        require(sync,sync_anchor,"V17 sync loadRoom")
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
    setInterval(loadRoom,5000);
  }"""
        require(sync,old_boot,"V17 boot")
        sync=sync.replace(old_boot,new_boot,1)

    # V18 executor fields.
    if V18 not in engine:
        schema_anchor="""    /* SYNC_TP_SL_EXECUTOR_V15_END */
  `);
}"""
        schema_new="""    /* SYNC_TP_SL_EXECUTOR_V15_END */
  `);

  /* SYNC_COPY_STATUS_LIVE_V18_SCHEMA */
  const executionColumns=new Set(
    db.prepare("PRAGMA table_info(delegated_copy_executions)").all().map(row=>String(row.name||''))
  );
  if(!executionColumns.has('fill_input_raw'))db.exec("ALTER TABLE delegated_copy_executions ADD COLUMN fill_input_raw TEXT NOT NULL DEFAULT '0'");
  if(!executionColumns.has('fill_output_raw'))db.exec("ALTER TABLE delegated_copy_executions ADD COLUMN fill_output_raw TEXT NOT NULL DEFAULT '0'");
  if(!executionColumns.has('close_reason'))db.exec("ALTER TABLE delegated_copy_executions ADD COLUMN close_reason TEXT NOT NULL DEFAULT ''");
  /* SYNC_COPY_STATUS_LIVE_V18_SCHEMA_END */
}"""
        require(engine,schema_anchor,"V18 engine schema")
        engine=engine.replace(schema_anchor,schema_new,1)

        confirmed_old="""      db.prepare(`UPDATE delegated_copy_executions SET status='confirmed',tx_signature=?,last_error='',updated_at=? WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?`).run(result.signature,now(),subscription.id,sig,side,mint);
      if(side==='buy'){"""
        confirmed_new="""      const fill=result?.fill||{};
      const fillInputRaw=side==='buy'?String(fill.spentLamports||'0'):String(fill.soldRaw||'0');
      const fillOutputRaw=side==='buy'?String(fill.acquiredRaw||'0'):String(fill.receivedLamports||'0');
      const closeReason=String(event.closeReason||'');
      db.prepare(`UPDATE delegated_copy_executions SET status='confirmed',tx_signature=?,fill_input_raw=?,fill_output_raw=?,close_reason=?,last_error='',updated_at=? WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?`)
        .run(result.signature,fillInputRaw,fillOutputRaw,closeReason,now(),subscription.id,sig,side,mint);
      if(side==='buy'){"""
        require(engine,confirmed_old,"V18 confirmed fill")
        engine=engine.replace(confirmed_old,confirmed_new,1)

        handle_anchor="""  async function handleTradeEvent(event={}){
    const started=Date.now();"""
        handle_helper="""  /* SYNC_COPY_STATUS_LIVE_V18 */
  function markSkippedExecution(subscription,event,reason){
    const sig=String(event.signature||`slot-${event.slot||0}`);
    const side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy';
    const mint=String(event.mint||'');
    const stamp=now();
    db.prepare(`
      INSERT INTO delegated_copy_executions
        (subscription_id,source_signature,side,mint,status,tx_signature,last_error,created_at,updated_at)
      VALUES (?,?,?,?, 'skipped','',?,?,?)
      ON CONFLICT(subscription_id,source_signature,side,mint) DO UPDATE SET
        status='skipped',tx_signature='',last_error=excluded.last_error,updated_at=excluded.updated_at
    `).run(subscription.id,sig,side,mint,String(reason||'not_copied'),stamp,stamp);
  }
  /* SYNC_COPY_STATUS_LIVE_V18_END */

""" + handle_anchor
        require(engine,handle_anchor,"V18 handleTradeEvent")
        engine=engine.replace(handle_anchor,handle_helper,1)

        loop_old="""    for(const sub of subscriptions){
      if(side==='buy'&&!sub.copy_buys)continue;if(side==='sell'&&!sub.copy_sells)continue;
      if(side==='buy'){
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        if(min>0||max>0){const mc=Number(pumpMarketCapUsd||0);if(!(mc>0)||(min>0&&mc<min)||(max>0&&mc>max)){blockedByMarketCap++;continue}}
      }
      ready.push(sub);
    }"""
        loop_new="""    for(const sub of subscriptions){
      if(side==='buy'&&!sub.copy_buys){markSkippedExecution(sub,event,'follow_buys_off');continue}
      if(side==='sell'&&!sub.copy_sells){markSkippedExecution(sub,event,'follow_sells_off');continue}
      if(side==='buy'){
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        if(min>0||max>0){
          const mc=Number(pumpMarketCapUsd||0);
          if(!(mc>0)||(min>0&&mc<min)||(max>0&&mc>max)){
            blockedByMarketCap++;
            markSkippedExecution(sub,event,'market_cap_filter');
            continue;
          }
        }
      }
      ready.push(sub);
    }"""
        require(engine,loop_old,"V18 decision loop")
        engine=engine.replace(loop_old,loop_new,1)

    # V18 API.
    if V18 not in server:
        route_anchor="""  /* SHADOW_DELEGATED_EXECUTION_V340_ROUTES_END */"""
        route_new="""  /* SYNC_COPY_STATUS_LIVE_V18 */
  if(parts[0]==='api'&&parts[1]==='entities'&&parts[2]&&parts[3]==='copy'&&parts[4]==='execution-status'&&parts.length===5&&method==='GET'){
    const user=requireUser(req,res,db); if(!user)return;
    const entity=db.prepare('SELECT id FROM entities WHERE id=?').get(parts[2]);
    if(!entity)return json(res,404,{error:'Entity not found'});

    const signature=clean(url.searchParams.get('signature'),160);
    const mint=clean(url.searchParams.get('mint'),120);
    const side=String(url.searchParams.get('side')||'').toLowerCase()==='sell'?'sell':'buy';
    if(!signature||!mint)return json(res,400,{error:'signature and mint are required'});

    const sub=db.prepare('SELECT * FROM copy_subscriptions WHERE user_id=? AND entity_id=?').get(user.id,entity.id);
    if(!sub)return json(res,200,{status:'off',reason:'no_subscription',side,mint,signature});
    if(!sub.enabled)return json(res,200,{status:'off',reason:'copy_off',side,mint,signature});
    if(side==='buy'&&!sub.copy_buys)return json(res,200,{status:'skipped',reason:'follow_buys_off',side,mint,signature});
    if(side==='sell'&&!sub.copy_sells)return json(res,200,{status:'skipped',reason:'follow_sells_off',side,mint,signature});

    const row=db.prepare(`
      SELECT status,tx_signature,last_error,updated_at,
             COALESCE(fill_input_raw,'0') AS fill_input_raw,
             COALESCE(fill_output_raw,'0') AS fill_output_raw,
             COALESCE(close_reason,'') AS close_reason
      FROM delegated_copy_executions
      WHERE subscription_id=? AND source_signature=? AND side=? AND mint=?
      LIMIT 1
    `).get(sub.id,signature,side,mint);

    if(!row){
      return json(res,200,{
        status:'pending',
        reason:'awaiting_execution',
        side,mint,signature,
        configuredAmountSol:Number(sub.amount_sol||0)
      });
    }

    const inputRaw=String(row.fill_input_raw||'0');
    const outputRaw=String(row.fill_output_raw||'0');
    const executedSol=side==='buy'
      ? Number(inputRaw||0)/1_000_000_000
      : Number(outputRaw||0)/1_000_000_000;
    const solUsd=await currentSolUsd();

    return json(res,200,{
      status:String(row.status||''),
      reason:String(row.last_error||''),
      side,mint,signature,
      txSignature:String(row.tx_signature||''),
      closeReason:String(row.close_reason||''),
      executedSol:Number.isFinite(executedSol)?executedSol:0,
      executedUsd:Number.isFinite(executedSol)&&solUsd>0?executedSol*solUsd:0,
      fillInputRaw:inputRaw,
      fillOutputRaw:outputRaw,
      updatedAt:String(row.updated_at||'')
    });
  }
  /* SYNC_COPY_STATUS_LIVE_V18_END */

""" + route_anchor
        require(server,route_anchor,"V18 execution-status route")
        server=server.replace(route_anchor,route_new,1)

    # V18 UI.
    if V18 not in sync:
        old_render="""  function renderActivity(){
    var list=qs("#activityList");
    var rows=state.room&&Array.isArray(state.room.recent)?state.room.recent:[];
    if(!rows.length){
      list.innerHTML='<div class="empty-row">Waiting for leader activity.</div>';
      return;
    }
    list.innerHTML=rows.map(function(row){
      var side=row.side==="sell"?"sell":"buy";
      var token=String(row.symbol||row.tokenName||short(row.tokenMint)||"TOKEN").replace(/^\\$/,"");
      var meta=[];
      if(Number(row.marketCap)>0)meta.push("MC "+fmtUsd(row.marketCap));
      if(Number(row.tradeUsd)>0)meta.push(fmtUsd(row.tradeUsd));
      if(row.eventAt)meta.push(ago(row.eventAt));
      return '<div class="activity-row '+side+'">'+
        '<span class="activity-dot"></span>'+
        '<div class="activity-copy"><strong>$'+esc(token)+'</strong><span>'+esc(meta.join(" · ")||"Confirmed signal")+'</span></div>'+
        '<span class="activity-side">'+(side==="sell"?"SELL":"BUY")+'</span>'+
      '</div>';
    }).join("");
  }"""

        new_render="""  /* SYNC_COPY_STATUS_LIVE_V18 */
  function copyExecutionKey(row){
    return String(row&&row.signature||"")+":"+String(row&&row.tokenMint||"")+":"+String(row&&row.side||row&&row.type||"");
  }

  function copyUsd(value){
    var n=Number(value||0);
    if(!isFinite(n)||n<=0)return "";
    if(n<1000)return "$"+n.toFixed(2);
    return fmtUsd(n);
  }

  function copyExecutionLine(row){
    state.copyExecutions=state.copyExecutions||{};
    var item=state.copyExecutions[copyExecutionKey(row)];
    if(!item)return "";
    var status=String(item.status||"").toLowerCase();
    var cls="copy-execution "+status;
    if(status==="confirmed"){
      var side=(row.side==="sell"?"sell":"buy");
      var label=side==="sell"?"✓ SYNC SOLD":"✓ SYNC COPIED";
      var parts=[label];
      if(Number(item.executedSol)>0){
        var sol=Number(item.executedSol);
        parts.push((sol<0.001?sol.toFixed(6):sol.toFixed(4))+" SOL");
      }
      if(Number(item.executedUsd)>0)parts.push("~"+copyUsd(item.executedUsd));
      var reason=String(item.closeReason||"");
      if(reason==="leader_sell")parts.push("LEADER SELL");
      else if(reason==="take_profit")parts.push("TAKE PROFIT");
      else if(reason==="stop_loss")parts.push("STOP LOSS");
      return '<span class="'+cls+'">'+esc(parts.join(" · "))+'</span>';
    }
    if(status==="queued"||status==="executing"||status==="pending"){
      return '<span class="'+cls+'">SYNC COPYING…</span>';
    }
    if(status==="skipped"){
      var why=String(item.reason||"");
      var label=why==="market_cap_filter"?"MC FILTER":why==="follow_buys_off"?"BUY OFF":why==="follow_sells_off"?"SELL OFF":"NOT COPIED";
      return '<span class="'+cls+'">SYNC SKIPPED · '+esc(label)+'</span>';
    }
    if(status==="error")return '<span class="'+cls+'">SYNC FAILED</span>';
    if(status==="off")return '<span class="'+cls+'">SYNC OFF</span>';
    return "";
  }

  function renderActivity(){
    var list=qs("#activityList");
    var rows=state.room&&Array.isArray(state.room.recent)?state.room.recent:[];
    if(!rows.length){
      list.innerHTML='<div class="empty-row">Waiting for leader activity.</div>';
      return;
    }
    list.innerHTML=rows.map(function(row){
      var side=row.side==="sell"?"sell":"buy";
      var token=String(row.symbol||row.tokenName||short(row.tokenMint)||"TOKEN").replace(/^\\$/,"");
      var meta=[];
      if(Number(row.marketCap)>0)meta.push("MC "+fmtUsd(row.marketCap));
      if(Number(row.tradeUsd)>0)meta.push(fmtUsd(row.tradeUsd));
      if(row.eventAt)meta.push(ago(row.eventAt));
      return '<div class="activity-row '+side+'">'+
        '<span class="activity-dot"></span>'+
        '<div class="activity-copy"><strong>$'+esc(token)+'</strong><span>'+esc(meta.join(" · ")||"Confirmed signal")+'</span>'+copyExecutionLine(row)+'</div>'+
        '<span class="activity-side">'+(side==="sell"?"SELL":"BUY")+'</span>'+
      '</div>';
    }).join("");
  }

  async function refreshCopyExecution(row,attempt){
    if(!row||!state.user||!state.wallet||!roomReady())return;
    var sig=String(row.signature||"");
    var mint=String(row.tokenMint||"");
    if(!sig||!mint)return;
    attempt=Number(attempt||0);
    state.copyExecutions=state.copyExecutions||{};
    var key=copyExecutionKey(row);
    try{
      var url="/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy/execution-status"+
        "?signature="+encodeURIComponent(sig)+
        "&mint="+encodeURIComponent(mint)+
        "&side="+encodeURIComponent(row.side==="sell"?"sell":"buy");
      var result=await api(url);
      state.copyExecutions[key]=result;
      renderActivity();

      var status=String(result.status||"").toLowerCase();
      if((status==="pending"||status==="queued"||status==="executing")&&attempt<10){
        var waits=[500,700,900,1200,1600,2200,3000,4000,5000,6000];
        setTimeout(function(){refreshCopyExecution(row,attempt+1)},waits[Math.min(attempt,waits.length-1)]);
      }
    }catch(error){}
  }

  function refreshVisibleCopyExecutions(){
    if(!state.user||!state.wallet||!roomReady())return;
    var rows=state.room&&Array.isArray(state.room.recent)?state.room.recent:[];
    rows.slice(0,12).forEach(function(row){
      var key=copyExecutionKey(row);
      var current=state.copyExecutions&&state.copyExecutions[key];
      var status=String(current&&current.status||"").toLowerCase();
      if(status==="confirmed"||status==="skipped"||status==="error"||status==="off")return;
      refreshCopyExecution(row,0);
    });
  }
  /* SYNC_COPY_STATUS_LIVE_V18_END */"""

        require(sync,old_render,"V18 renderActivity")
        sync=sync.replace(old_render,new_render,1)

        old_prepend="""  function prependLiveSignal(row){
    if(!row||!state.room)return;
    var rows=Array.isArray(state.room.recent)?state.room.recent:[];
    var key=liveSignalKey(row);
    state.room.recent=[row].concat(rows.filter(function(item){return liveSignalKey(item)!==key})).slice(0,12);
    renderActivity();
  }"""
        new_prepend="""  function prependLiveSignal(row){
    if(!row||!state.room)return;
    var rows=Array.isArray(state.room.recent)?state.room.recent:[];
    var key=liveSignalKey(row);
    state.room.recent=[row].concat(rows.filter(function(item){return liveSignalKey(item)!==key})).slice(0,12);
    renderActivity();
    refreshCopyExecution(row,0);
  }"""
        require(sync,old_prepend,"V18 prepend live signal")
        sync=sync.replace(old_prepend,new_prepend,1)

        old_load_room="""      renderHero();
      renderActivity();
      renderTradeAlerts();"""
        new_load_room="""      renderHero();
      renderActivity();
      renderTradeAlerts();
      refreshVisibleCopyExecutions();"""
        require(sync,old_load_room,"V18 loadRoom refresh")
        sync=sync.replace(old_load_room,new_load_room,1)

        old_hydrate="""    hydrateCopyForm();
  }

  function bytesToBase64(bytes){"""
        new_hydrate="""    hydrateCopyForm();
    refreshVisibleCopyExecutions();
  }

  function bytesToBase64(bytes){"""
        require(sync,old_hydrate,"V18 session refresh")
        sync=sync.replace(old_hydrate,new_hydrate,1)

    if V18 not in css:
        css += """

/* SYNC_COPY_STATUS_LIVE_V18 */
.activity-copy .copy-execution{
  margin-top:2px;
  font-size:10px;
  line-height:1.35;
  font-weight:700;
  letter-spacing:.035em;
  color:#7f7f7f;
}
.activity-copy .copy-execution.confirmed{color:var(--green)}
.activity-copy .copy-execution.error{color:var(--red)}
.activity-copy .copy-execution.pending,
.activity-copy .copy-execution.queued,
.activity-copy .copy-execution.executing{color:#c8c8c8}
.activity-copy .copy-execution.skipped,
.activity-copy .copy-execution.off{color:#666}
/* SYNC_COPY_STATUS_LIVE_V18_END */
"""

    SERVER.write_text(server)
    ENGINE.write_text(engine)
    SYNC.write_text(sync)
    CSS.write_text(css)

except Exception as e:
    for target,backup in backups.items():
        try: shutil.copy2(backup,target)
        except Exception: pass
    raise SystemExit(f"ERROR: {e}. Original files restored.")

print("SYNC COPY STATUS LIVE V18 INSTALLED")
print("Included:")
print("  V17 realtime Live signals if missing")
print("  COPIED / SOLD / COPYING / SKIPPED / FAILED per leader signal")
print("  actual confirmed SOL fill + approximate USD")
print("  MC FILTER / BUY OFF / SELL OFF reasons")
print("No Program ID, keypairs, vault addresses, balances, or copy limits were changed.")
