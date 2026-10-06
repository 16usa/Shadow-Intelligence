
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

live = Path("src/live-intelligence.mjs").read_text()
required_live = [
    "SHADOW_FAST_COPY_HOT_PATH_V370",
    "onFastTrade=null",
    "dispatchFastTrade(",
    "scheduleTradeEnrichment(",
    "lastDispatchLagMs"
]
missing = [x for x in required_live if x not in live]
if missing:
    raise SystemExit("ERROR: v1 realtime hot-path half is missing: " + ", ".join(missing))

p = Path("src/internal-copy-engine.mjs")
s = p.read_text()

if "SHADOW_FAST_COPY_ENGINE_EVENT_V373" not in s:
    marker = "  function environmentStatus(){\n"
    if marker not in s:
        raise SystemExit("ERROR: internal engine environmentStatus marker not found")

    block = r'''  /* SHADOW_FAST_COPY_ENGINE_EVENT_V373 */
  let fastEventState={
    seen:0,
    lastEventAt:'',
    lastSignature:'',
    lastServerDispatchLagMs:0,
    lastDecisionMs:0,
    candidates:0,
    blockedByMarketCap:0,
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
    fastEventState.blockedByMarketCap=blockedByMarketCap;
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
  /* SHADOW_FAST_COPY_ENGINE_EVENT_V373_END */

'''
    s = s.replace(marker, block + marker, 1)

status_old = "      ...delegatedArtifactStatus(),\n      lastError,\n"
status_new = "      ...delegatedArtifactStatus(),\n      fastEvent:{...fastEventState},\n      lastError,\n"
if "fastEvent:{...fastEventState}" not in s:
    s = replace_once(s, status_old, status_new, "engine fast event status")

return_old = "  return {status,start,stop,syncSubscription,authorizationDetails,prepareAction,confirmAction,withdrawSol};\n"
return_new = "  return {status,start,stop,syncSubscription,authorizationDetails,prepareAction,confirmAction,withdrawSol,handleTradeEvent};\n"
if "withdrawSol,handleTradeEvent" not in s:
    s = replace_once(s, return_old, return_new, "engine handleTradeEvent export")

p.write_text(s)

p = Path("server.mjs")
s = p.read_text()

old = "  const live=createLiveIntelligence(db,{fetchImpl});\n"
new = "  const live=createLiveIntelligence(db,{\n    fetchImpl,\n    onFastTrade:event=>internalCopyEngine.handleTradeEvent?.(event)\n  });\n"
if "onFastTrade:event=>internalCopyEngine.handleTradeEvent" not in s:
    s = replace_once(s, old, new, "server fast trade wiring")

p.write_text(s)

print("Repaired:")
print("  src/internal-copy-engine.mjs")
print("  server.mjs")
print("Verified existing hot path:")
print("  src/live-intelligence.mjs")
