
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

p = Path("src/live-intelligence.mjs")
s = p.read_text()

s = replace_once(
    s,
    "export function createLiveIntelligence(db,{fetchImpl=fetch}={}) {",
    "export function createLiveIntelligence(db,{fetchImpl=fetch,onFastTrade=null}={}) {",
    "createLiveIntelligence signature"
)

s = replace_once(
    s,
    """    lastProcessedAt:'',
    lastError:'',
    queueDepth:0
  };
""",
    """    lastProcessedAt:'',
    lastError:'',
    queueDepth:0,
    fastPath:{
      dispatched:0,
      lastDispatchAt:'',
      lastDispatchLagMs:0,
      maxDispatchLagMs:0,
      lastSignature:'',
      lastError:''
    }
  };
""",
    "realtime fastPath stats"
)

marker = """  async function ingestWebhookBatch(events){
"""
if "SHADOW_FAST_COPY_HOT_PATH_V370" not in s:
    helpers = """  /* SHADOW_FAST_COPY_HOT_PATH_V370 */
  const tradeEnrichmentPending=new Set();

  function tradeEventKey(wallet,activity){
    return `chain:${wallet.id}:${activity.signature}:${activity.mint}:${activity.type}`;
  }

  function cachedTokenForFastPath(mint){
    return db.prepare('SELECT * FROM tokens WHERE mint=?').get(mint)||null;
  }

  function dispatchFastTrade(wallet,activity,token,eventReceivedAtMs){
    if(typeof onFastTrade!=='function')return;

    const dispatchedAtMs=Date.now();
    const lagMs=Math.max(0,dispatchedAtMs-Number(eventReceivedAtMs||dispatchedAtMs));
    const fast=realtime.fastPath;

    fast.dispatched++;
    fast.lastDispatchAt=nowIso();
    fast.lastDispatchLagMs=lagMs;
    fast.maxDispatchLagMs=Math.max(Number(fast.maxDispatchLagMs||0),lagMs);
    fast.lastSignature=String(activity.signature||'');

    const marketAt=String(token?.last_market_at||'');
    const parsedMarketAt=marketAt?Date.parse(marketAt):NaN;
    const marketAgeMs=Number.isFinite(parsedMarketAt)
      ? Math.max(0,Date.now()-parsedMarketAt)
      : null;

    const payload={
      entityId:wallet.entity_id,
      sourceWalletId:wallet.id,
      sourceWalletAddress:wallet.address,
      signature:String(activity.signature||''),
      slot:Number(activity.slot||0),
      blockTime:activity.blockTime||null,
      side:String(activity.type||'').toLowerCase()==='sell'?'sell':'buy',
      mint:String(activity.mint||''),
      tokenAmount:Number(activity.tokenAmount||0),
      solAmount:Number(activity.solAmount||0),
      quoteAsset:String(activity.quoteAsset||''),
      quoteAmount:Number(activity.quoteAmount||0),
      source:String(activity.source||'solana'),
      isPump:!!activity.isPump,
      cachedMarketCapUsd:Number(token?.market_cap||0),
      cachedMarketAt:marketAt,
      cachedMarketAgeMs:marketAgeMs,
      webhookReceivedAtMs:Number(eventReceivedAtMs||dispatchedAtMs),
      dispatchedAtMs,
      serverDispatchLagMs:lagMs
    };

    Promise.resolve()
      .then(()=>onFastTrade(payload))
      .catch(error=>{
        fast.lastError=String(error?.message||error).slice(0,300);
        console.warn('Fast copy event dispatch failed:',fast.lastError);
      });
  }

  function scheduleTradeEnrichment(wallet,activity){
    const eventKey=tradeEventKey(wallet,activity);
    if(tradeEnrichmentPending.has(eventKey))return;
    tradeEnrichmentPending.add(eventKey);

    setImmediate(async()=>{
      try{
        let token=null;
        try{
          token=await ensureToken(activity.mint);
        }catch(error){
          console.warn('Background token hydration failed:',String(error?.message||error));
          token=cachedTokenForFastPath(activity.mint);
        }

        let tradeUsd=Math.abs(Number(activity.tradeUsd||0));
        let tradeUsdSource=String(activity.tradeUsdSource||'');
        let quoteAsset=String(activity.quoteAsset||'');
        let quoteAmount=Math.abs(Number(activity.quoteAmount||0));

        if(!(tradeUsd>0) && Math.abs(Number(activity.solAmount||0))>1e-12){
          const solUsd=await currentSolUsdForTrade();
          if(solUsd>0){
            const sol=Math.abs(Number(activity.solAmount||0));
            quoteAsset=quoteAsset||'SOL';
            quoteAmount=quoteAmount||sol;
            tradeUsd=sol*solUsd;
            tradeUsdSource='sol-live-webhook-bg';
          }
        }

        if(token || tradeUsd>0){
          db.prepare(`
            UPDATE wallet_activity
            SET token_symbol=?,
                token_name=?,
                price_usd=?,
                price_change=?,
                is_pump=?,
                quote_asset=?,
                quote_amount=?,
                trade_usd=?,
                trade_usd_source=?
            WHERE event_key=?
          `).run(
            token?.symbol||`$${String(activity.mint||'').slice(0,4)}`,
            token?.name||String(activity.mint||'').slice(0,8),
            Number(token?.price_usd||0),
            Number(token?.price_change||0),
            (activity.isPump||token?.is_pump)?1:0,
            quoteAsset,
            quoteAmount,
            tradeUsd,
            tradeUsdSource,
            eventKey
          );
        }
      }catch(error){
        console.warn('Background trade enrichment failed:',String(error?.message||error));
      }finally{
        tradeEnrichmentPending.delete(eventKey);
      }
    });
  }
  /* SHADOW_FAST_COPY_HOT_PATH_V370_END */

"""
    if marker not in s:
        raise SystemExit("ERROR: ingestWebhookBatch marker not found")
    s = s.replace(marker, helpers + marker, 1)

s = replace_once(
    s,
    """    let matched=0,inserted=0;
    let solUsd=0;

    for(const event of rows){
""",
    """    let matched=0,inserted=0;

    for(const event of rows){
      const eventReceivedAtMs=Number(event.__shadowWebhookReceivedAtMs||Date.now());
""",
    "ingest prefix"
)

s = replace_once(
    s,
    """        for(const activity of activities){
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
""",
    """        for(const activity of activities){
          if(!isTrackedTradeActivity(activity))continue;

          // Critical path: database-only. Never wait on DexScreener, metadata,
          // SOL/USD or any other external request before handing the trade to
          // the copy engine.
          const token=cachedTokenForFastPath(activity.mint);

          if(insertActivity(wallet,activity,token)){
            inserted++;
            walletInserted++;

            // Dispatch immediately after dedupe/insert. Market/token enrichment
            // runs separately and cannot hold up copy-trade reaction time.
            dispatchFastTrade(wallet,activity,token,eventReceivedAtMs);
            scheduleTradeEnrichment(wallet,activity);
          }
        }
""",
    "webhook hot path"
)

s = replace_once(
    s,
    """  function enqueueWebhook(payload){
    const items=(Array.isArray(payload)?payload:[payload]).filter(x=>x&&typeof x==='object');
    realtime.lastDeliveryAt=nowIso();
    if(!items.length)return {accepted:0,queueDepth:webhookQueue.length};
    webhookQueue.push(...items.slice(0,500));
""",
    """  function enqueueWebhook(payload){
    const items=(Array.isArray(payload)?payload:[payload]).filter(x=>x&&typeof x==='object');
    const receivedAtMs=Date.now();
    realtime.lastDeliveryAt=nowIso();
    if(!items.length)return {accepted:0,queueDepth:webhookQueue.length};
    for(const item of items){
      item.__shadowWebhookReceivedAtMs=receivedAtMs;
    }
    webhookQueue.push(...items.slice(0,500));
""",
    "webhook receive timestamp"
)

p.write_text(s)

p = Path("src/internal-copy-engine.mjs")
s = p.read_text()

marker = """  function environmentStatus(){
"""
if "SHADOW_FAST_COPY_ENGINE_EVENT_V370" not in s:
    helper = """  /* SHADOW_FAST_COPY_ENGINE_EVENT_V370 */
  let fastEventState={
    seen:0,
    lastEventAt:'',
    lastSignature:'',
    lastServerDispatchLagMs:0,
    lastDecisionMs:0,
    candidates:0,
    lastReason:''
  };

  function handleTradeEvent(event={}){
    const started=Date.now();
    const entityId=String(event.entityId||'');
    const side=String(event.side||'').toLowerCase()==='sell'?'sell':'buy';

    fastEventState.seen++;
    fastEventState.lastEventAt=now();
    fastEventState.lastSignature=String(event.signature||'');
    fastEventState.lastServerDispatchLagMs=Number(event.serverDispatchLagMs||0);

    if(!entityId){
      fastEventState.lastReason='missing_entity';
      fastEventState.lastDecisionMs=Date.now()-started;
      return {accepted:false,reason:'missing_entity'};
    }

    const subscriptions=db.prepare(`
      SELECT *
      FROM copy_subscriptions
      WHERE entity_id=? AND enabled=1
      ORDER BY updated_at DESC
    `).all(entityId);

    let candidates=0;
    let blockedByMarketCap=0;

    for(const sub of subscriptions){
      if(side==='buy' && !sub.copy_buys)continue;
      if(side==='sell' && !sub.copy_sells)continue;

      if(side==='buy'){
        const min=Math.max(0,Number(sub.min_market_cap_usd||0));
        const max=Math.max(0,Number(sub.max_market_cap_usd||0));
        const rangeEnabled=min>0||max>0;

        if(rangeEnabled){
          const mc=Number(event.cachedMarketCapUsd||0);
          const age=Number(event.cachedMarketAgeMs);
          const fresh=mc>0 && Number.isFinite(age) && age<=5000;

          if(!fresh || (min>0&&mc<min) || (max>0&&mc>max)){
            blockedByMarketCap++;
            continue;
          }
        }
      }

      candidates++;
    }

    fastEventState.candidates=candidates;
    fastEventState.lastDecisionMs=Date.now()-started;

    fastEventState.lastReason=candidates===0
      ? (blockedByMarketCap>0?'market_cap_filter':'no_active_subscription')
      : 'executor_security_gate';

    return {
      accepted:false,
      candidates,
      blockedByMarketCap,
      decisionMs:fastEventState.lastDecisionMs,
      executionAllowed:false,
      reason:fastEventState.lastReason
    };
  }
  /* SHADOW_FAST_COPY_ENGINE_EVENT_V370_END */

"""
    if marker not in s:
        raise SystemExit("ERROR: environmentStatus marker not found")
    s = s.replace(marker, helper + marker, 1)

s = replace_once(
    s,
    """      mode:'noncustodial_delegated_vault',
      lastError,
    };
""",
    """      mode:'noncustodial_delegated_vault',
      lastError,
      fastEvent:{...fastEventState},
    };
""",
    "engine fast event status"
)

s = replace_once(
    s,
    """  return {status,start,stop,syncSubscription,authorizationDetails,prepareAction,confirmAction,withdrawSol};
""",
    """  return {status,start,stop,syncSubscription,authorizationDetails,prepareAction,confirmAction,withdrawSol,handleTradeEvent};
""",
    "engine handleTradeEvent export"
)

p.write_text(s)

p = Path("server.mjs")
s = p.read_text()

s = replace_once(
    s,
    """  const live=createLiveIntelligence(db,{fetchImpl});
""",
    """  const live=createLiveIntelligence(db,{
    fetchImpl,
    onFastTrade:event=>internalCopyEngine.handleTradeEvent?.(event)
  });
""",
    "server fast trade wiring"
)

p.write_text(s)

print("Patched:")
print("  src/live-intelligence.mjs")
print("  src/internal-copy-engine.mjs")
print("  server.mjs")
