
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) Rolling server hot-path latency metrics
p = Path("src/live-intelligence.mjs")
s = p.read_text()

anchor = "  let solanaHealthSnapshot={at:0,value:null};\n"
if "SHADOW_COPY_LATENCY_METER_V380_LIVE" not in s:
    block = r"""  /* SHADOW_COPY_LATENCY_METER_V380_LIVE */
  const fastDispatchSamples=[];

  function latencyPercentile(values,p){
    if(!values.length)return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
    return Number(sorted[index]||0);
  }

  function recordFastDispatchLatency(value){
    const n=Math.max(0,Number(value)||0);
    fastDispatchSamples.push(n);
    if(fastDispatchSamples.length>100)fastDispatchSamples.shift();
  }

  function publicFastPath(){
    return {
      ...realtime.fastPath,
      sampleCount:fastDispatchSamples.length,
      p50DispatchLagMs:latencyPercentile(fastDispatchSamples,50),
      p95DispatchLagMs:latencyPercentile(fastDispatchSamples,95)
    };
  }
  /* SHADOW_COPY_LATENCY_METER_V380_LIVE_END */

"""
    if anchor not in s:
        raise SystemExit("ERROR: live latency insertion marker not found")
    s = s.replace(anchor, block + anchor, 1)

old_dispatch = """    fast.maxDispatchLagMs=Math.max(Number(fast.maxDispatchLagMs||0),lagMs);
    fast.lastSignature=String(activity.signature||'');
"""
new_dispatch = """    fast.maxDispatchLagMs=Math.max(Number(fast.maxDispatchLagMs||0),lagMs);
    fast.lastSignature=String(activity.signature||'');
    recordFastDispatchLatency(lagMs);
"""
s = replace_once(s, old_dispatch, new_dispatch, "record webhook->engine latency")

old_health = "      realtime:{...realtime,queueDepth:webhookQueue.length,processing:webhookProcessing},\n"
new_health = "      realtime:{...realtime,fastPath:publicFastPath(),queueDepth:webhookQueue.length,processing:webhookProcessing},\n"
s = replace_once(s, old_health, new_health, "publish live latency percentiles")
p.write_text(s)

# 2) Rolling engine-decision metrics
p = Path("src/internal-copy-engine.mjs")
s = p.read_text()

state_anchor = """  let fastEventState={
    seen:0,
    lastEventAt:'',
    lastSignature:'',
    lastServerDispatchLagMs:0,
    lastDecisionMs:0,
    candidates:0,
    blockedByMarketCap:0,
    lastReason:''
  };
"""
if "SHADOW_COPY_LATENCY_METER_V380_ENGINE" not in s:
    replacement = state_anchor + r"""
  /* SHADOW_COPY_LATENCY_METER_V380_ENGINE */
  const fastDecisionSamples=[];

  function decisionPercentile(values,p){
    if(!values.length)return 0;
    const sorted=[...values].sort((a,b)=>a-b);
    const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
    return Number(sorted[index]||0);
  }

  function recordDecisionLatency(value){
    const n=Math.max(0,Number(value)||0);
    fastDecisionSamples.push(n);
    if(fastDecisionSamples.length>100)fastDecisionSamples.shift();
  }

  function publicFastEvent(){
    return {
      ...fastEventState,
      sampleCount:fastDecisionSamples.length,
      p50DecisionMs:decisionPercentile(fastDecisionSamples,50),
      p95DecisionMs:decisionPercentile(fastDecisionSamples,95)
    };
  }
  /* SHADOW_COPY_LATENCY_METER_V380_ENGINE_END */
"""
    s = replace_once(s, state_anchor, replacement, "engine latency helpers")

old_missing = """      fastEventState.lastReason='missing_entity';
      fastEventState.lastDecisionMs=Date.now()-started;
      return {accepted:false,reason:'missing_entity'};
"""
new_missing = """      fastEventState.lastReason='missing_entity';
      fastEventState.lastDecisionMs=Date.now()-started;
      recordDecisionLatency(fastEventState.lastDecisionMs);
      return {accepted:false,reason:'missing_entity'};
"""
s = replace_once(s, old_missing, new_missing, "record missing-entity decision latency")

old_decision = """    fastEventState.lastDecisionMs=Date.now()-started;

    fastEventState.lastReason=candidates===0
"""
new_decision = """    fastEventState.lastDecisionMs=Date.now()-started;
    recordDecisionLatency(fastEventState.lastDecisionMs);

    fastEventState.lastReason=candidates===0
"""
s = replace_once(s, old_decision, new_decision, "record normal decision latency")

old_status = "      fastEvent:{...fastEventState},\n"
new_status = "      fastEvent:publicFastEvent(),\n"
s = replace_once(s, old_status, new_status, "publish engine latency percentiles")
p.write_text(s)

# 3) System page panel
p = Path("public/index.html")
s = p.read_text()

old_trading = """<section class="si-panel"><h3>Trading shell</h3><label class="si-toggle"><span>Copy trading enabled</span><input id="setCopy" type="checkbox"/></label><label>High signal threshold<input id="setRiskThreshold" class="si-input" type="number" min="1" max="100"/></label><label class="si-toggle"><span>Demo data mode</span><input id="setDemo" type="checkbox"/></label></section>"""
new_trading = """<section class="si-panel"><h3>Trading shell</h3><label class="si-toggle"><span>Copy trading enabled</span><input id="setCopy" type="checkbox"/></label><label>High signal threshold<input id="setRiskThreshold" class="si-input" type="number" min="1" max="100"/></label><label class="si-toggle"><span>Demo data mode</span><input id="setDemo" type="checkbox"/></label>
<!-- SHADOW_COPY_LATENCY_METER_V380_UI -->
<div class="si-copy-latency">
  <div class="si-copy-latency-head"><strong>Copy latency</strong><small id="copyLatencySignal">Waiting for a live trade</small></div>
  <div class="si-copy-latency-grid">
    <div><strong id="copyLatencyLast">—</strong><small>Webhook → Engine</small></div>
    <div><strong id="copyLatencyDecision">—</strong><small>Engine decision</small></div>
    <div><strong id="copyLatencyTotal">—</strong><small>Internal total</small></div>
    <div><strong id="copyLatencyP95">—</strong><small>P95 / 100 signals</small></div>
  </div>
</div>
<!-- SHADOW_COPY_LATENCY_METER_V380_UI_END -->
</section>"""
s = replace_once(s, old_trading, new_trading, "settings latency panel")
p.write_text(s)

# 4) Client polling
p = Path("public/app.js")
s = p.read_text()

load_marker = "async function loadSettings(){\n"
if "SHADOW_COPY_LATENCY_METER_V380_APP" not in s:
    app_block = r"""/* SHADOW_COPY_LATENCY_METER_V380_APP */
let copyLatencyTimer=0;

function latencyMs(value){
  const n=Number(value);
  return Number.isFinite(n)?`${Math.max(0,Math.round(n))} ms`:'—';
}

async function refreshCopyLatencyMeter(){
  const last=$('#copyLatencyLast');
  if(!last)return;

  try{
    const [live,engine]=await Promise.all([
      api('/api/live/status'),
      api('/api/copy-engine/status')
    ]);

    const fast=live?.realtime?.fastPath||{};
    const decision=engine?.fastEvent||{};

    const dispatchMs=Number(fast.lastDispatchLagMs||0);
    const decisionMs=Number(decision.lastDecisionMs||0);
    const hasSignal=Number(fast.dispatched||0)>0;

    $('#copyLatencyLast').textContent=hasSignal?latencyMs(dispatchMs):'—';
    $('#copyLatencyDecision').textContent=hasSignal?latencyMs(decisionMs):'—';
    $('#copyLatencyTotal').textContent=hasSignal?latencyMs(dispatchMs+decisionMs):'—';
    $('#copyLatencyP95').textContent=Number(fast.sampleCount||0)>0
      ? latencyMs(Number(fast.p95DispatchLagMs||0)+Number(decision.p95DecisionMs||0))
      : '—';

    const signal=$('#copyLatencySignal');
    if(signal){
      signal.textContent=hasSignal
        ? `${Number(fast.dispatched||0)} live signal${Number(fast.dispatched||0)===1?'':'s'} · last ${fast.lastDispatchAt?ago(fast.lastDispatchAt)+' ago':'now'}`
        : 'Waiting for a live trade';
    }
  }catch(error){
    const signal=$('#copyLatencySignal');
    if(signal)signal.textContent='Latency status unavailable';
  }
}

function startCopyLatencyMeter(){
  if(copyLatencyTimer)clearInterval(copyLatencyTimer);
  refreshCopyLatencyMeter().catch(()=>{});
  copyLatencyTimer=setInterval(()=>{
    if(currentPage!=='settings')return;
    refreshCopyLatencyMeter().catch(()=>{});
  },2000);
}
/* SHADOW_COPY_LATENCY_METER_V380_APP_END */

"""
    if load_marker not in s:
        raise SystemExit("ERROR: loadSettings marker not found")
    s = s.replace(load_marker, app_block + load_marker, 1)

old_wallet_render = "    await renderWalletInventory('#walletsAdminTable');\n"
new_wallet_render = """    await renderWalletInventory('#walletsAdminTable');
    startCopyLatencyMeter();
"""
s = replace_once(s, old_wallet_render, new_wallet_render, "start latency meter on settings load")
p.write_text(s)

# 5) Strict minimal styling
p = Path("public/styles.css")
s = p.read_text()
if "SHADOW_COPY_LATENCY_METER_V380_CSS" not in s:
    s += r"""

/* SHADOW_COPY_LATENCY_METER_V380_CSS */
.si-copy-latency{
  margin-top:18px;
  border-top:1px solid var(--border);
  padding-top:16px;
}
.si-copy-latency-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:12px;
}
.si-copy-latency-head small{
  color:var(--muted);
  text-align:right;
}
.si-copy-latency-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  border:1px solid var(--border);
  border-radius:18px;
  overflow:hidden;
}
.si-copy-latency-grid>div{
  min-width:0;
  padding:14px 16px;
}
.si-copy-latency-grid>div:nth-child(odd){
  border-right:1px solid var(--border);
}
.si-copy-latency-grid>div:nth-child(-n+2){
  border-bottom:1px solid var(--border);
}
.si-copy-latency-grid strong{
  display:block;
  font-size:18px;
  line-height:1.15;
}
.si-copy-latency-grid small{
  display:block;
  margin-top:5px;
  color:var(--muted);
  font-size:12px;
}
/* SHADOW_COPY_LATENCY_METER_V380_CSS_END */
"""
p.write_text(s)

print("Patched:")
print("  src/live-intelligence.mjs")
print("  src/internal-copy-engine.mjs")
print("  public/index.html")
print("  public/app.js")
print("  public/styles.css")
