#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: run this patch from inside the Shadow-Intelligence git repository."
  exit 1
fi

cd "$ROOT"

ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git branch --show-current 2>/dev/null || true)"

case "$ORIGIN" in
  *16usa/Shadow-Intelligence*) ;;
  *)
    echo "ERROR: this does not look like 16usa/Shadow-Intelligence."
    echo "origin: $ORIGIN"
    exit 1
    ;;
esac

if [ "$BRANCH" != "main" ]; then
  echo "ERROR: expected branch main, found: $BRANCH"
  exit 1
fi

for f in server.mjs public/app.js public/si-graph.js; do
  [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done

python3 - <<'PY'
from pathlib import Path

def require(text, needle, label):
    if needle not in text:
        raise SystemExit(f"ERROR: expected marker not found: {label}")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# server.mjs — authoritative token -> all connected Entities endpoint
# ---------------------------------------------------------------------
p = Path("server.mjs")
s = p.read_text()

api_marker = "  /* SHADOW_CURRENT_HOLDINGS_V219_API */"
require(s, api_marker, "server token holdings marker")

if "SHADOW_TOKEN_ENTITY_GRAPH_V350_API" not in s:
    route = r'''  /* SHADOW_TOKEN_ENTITY_GRAPH_V350_API */
  if (
    parts[0]==='api' &&
    parts[1]==='tokens' &&
    parts[2] &&
    parts[3]==='entities' &&
    parts.length===4 &&
    method==='GET'
  ) {
    const mint=clean(parts[2],120);
    if(!mint || !isSolanaAddress(mint)){
      return json(res,400,{error:'Invalid Solana token mint'});
    }

    const token=db.prepare('SELECT id,mint FROM tokens WHERE mint=?').get(mint);
    if(!token)return json(res,404,{error:'Token not found'});

    const items=db.prepare(`
      WITH linked_entity_ids(entity_id) AS (
        SELECT COALESCE(h.entity_id,w.entity_id)
        FROM wallet_holdings h
        LEFT JOIN wallets w ON w.id=h.wallet_id
        WHERE h.mint=?
          AND COALESCE(h.amount,0)>1e-12
          AND COALESCE(h.entity_id,w.entity_id) IS NOT NULL

        UNION

        SELECT COALESCE(a.entity_id,w.entity_id)
        FROM wallet_activity a
        LEFT JOIN wallets w ON w.id=a.wallet_id
        WHERE a.mint=?
          AND COALESCE(a.entity_id,w.entity_id) IS NOT NULL

        UNION

        SELECT i.entity_id
        FROM incidents i
        WHERE i.token_id=?
          AND i.entity_id IS NOT NULL

        UNION

        SELECT ev.entity_id
        FROM evidence ev
        WHERE ev.token_mint=?
          AND ev.entity_id IS NOT NULL

        UNION

        SELECT sp.entity_id
        FROM social_posts sp
        WHERE sp.token_mint=?
          AND sp.entity_id IS NOT NULL
      )
      SELECT
        e.*,
        (SELECT COUNT(*) FROM wallets w WHERE w.entity_id=e.id) AS walletCount
      FROM entities e
      JOIN linked_entity_ids linked ON linked.entity_id=e.id
      ORDER BY LOWER(COALESCE(e.name,'')),e.created_at
    `).all(mint,mint,token.id,mint,mint).map(e=>({
      ...e,
      riskScore:e.risk_score,
      followerLosses:e.follower_losses,
      xHandle:e.x_handle,
      walletCount:Number(e.walletCount||0)
    }));

    return json(res,200,{
      mint,
      items,
      count:items.length,
      relationship:'all-known-token-links',
      authoritative:true
    });
  }
  /* SHADOW_TOKEN_ENTITY_GRAPH_V350_API_END */

'''
    s = s.replace(api_marker, route + api_marker, 1)

p.write_text(s)

# ---------------------------------------------------------------------
# public/app.js — token page loads every connected Entity by mint
# ---------------------------------------------------------------------
p = Path("public/app.js")
s = p.read_text()

start_marker = "function tokenDetail(t){"
end_marker = "\n/* SHADOW_ENTITY_UNIVERSAL_SOURCE_V270 */"
require(s, start_marker, "tokenDetail start")
require(s, end_marker, "tokenDetail end")

start = s.index(start_marker)
end = s.index(end_marker, start)

new_token_detail = r'''/* SHADOW_TOKEN_ENTITY_GRAPH_V350_CLIENT */
async function tokenDetail(t){
  const related=state.overview?.feed?.filter(x=>
    x?.tokenMint===t.mint ||
    x?.mint===t.mint ||
    x?.symbol===t.symbol ||
    x?.tokenName===t.name
  )||[];

  modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(t,'xl')}<h2>${esc(t.symbol||'Token')}</h2><p>${esc(t.name||'Unknown')}</p><p>${tokenAddressCopyHtml(t.mint)}</p><div class="si-metrics"><div class="si-metric"><strong>${money(t.market_cap||0)}</strong><small>Market cap</small></div><div class="si-metric"><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong><small>Change</small></div><div class="si-metric"><strong>${money(t.liquidity_usd||0)}</strong><small>Liquidity</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>RECENT SIGNALS</span></div>${related.slice(0,12).map(eventHtml).join('')||'<div class="guest-note">No recent incident records.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);

  const graph=new ShadowGraph(
    $('#detailGraph'),
    {focus:'token',entities:[],wallets:[],tokens:[t],activity:[]},
    {onSelect:openObject}
  );

  state.detailGraph=graph;
  bindTokenAddressCopy($('#modalBody')||document);

  try{
    const data=await api(`/api/tokens/${encodeURIComponent(t.mint)}/entities`);
    if(state.detailGraph!==graph)return;

    const entities=Array.isArray(data?.items)?data.items:[];
    graph.setModel({
      focus:'token',
      entities,
      wallets:[],
      tokens:[t],
      activity:[]
    });
  }catch(error){
    console.warn('Token entity graph hydration failed:',error);

    if(state.detailGraph!==graph)return;

    const fallback=state.entities.filter(e=>
      related.some(x=>String(x?.entityId||x?.entity_id||'')===String(e?.id||''))
    );

    graph.setModel({
      focus:'token',
      entities:fallback,
      wallets:[],
      tokens:[t],
      activity:[]
    });
  }
}
/* SHADOW_TOKEN_ENTITY_GRAPH_V350_CLIENT_END */
'''

s = s[:start] + new_token_detail + s[end:]
p.write_text(s)

# ---------------------------------------------------------------------
# public/si-graph.js — token-centric detail layout
# ---------------------------------------------------------------------
p = Path("public/si-graph.js")
s = p.read_text()

s = s.replace(
    "/* Shadow Intelligence — canonical interactive graph engine v1.8.0",
    "/* Shadow Intelligence — canonical interactive graph engine v1.9.0",
    1
)

old_set_model = r'''    setModel(model){
      this.model=model||{};
      this.mode=this.root.id==='globalMap'?'global':'detail';
      const anchor=this.model.entities?.[0]?.id||this.model.tokens?.[0]?.mint||this.model.wallets?.[0]?.id||'network';
      this.scope=this.mode==='global'?'global':`detail:${anchor}`;
      this.build();
      this.fit();
      this.schedule();
    }
'''
new_set_model = r'''    setModel(model){
      this.model=model||{};
      this.mode=this.root.id==='globalMap'?'global':'detail';
      this.focus=this.mode==='detail'&&this.model.focus==='token'?'token':'entity';

      const anchor=this.focus==='token'
        ? (this.model.tokens?.[0]?.mint||this.model.tokens?.[0]?.id||'token')
        : (this.model.entities?.[0]?.id||this.model.tokens?.[0]?.mint||this.model.wallets?.[0]?.id||'network');

      this.scope=this.mode==='global'?'global':`detail:${this.focus}:${anchor}`;
      this.build();
      this.fit();
      this.schedule();
    }
'''
s = replace_once(s, old_set_model, new_set_model, "graph setModel")

old_build = r'''    build(){
      const es=this.model.entities||[];
      const ws=this.model.wallets||[];
      const ts=this.model.tokens||[];
      this.nodes=[];
      this.edges=[];
      this.pulses=[];
      this.empty.style.display='none';

      if(this.mode==='global') this.buildGlobal(es);
      else this.buildDetail(es[0],ws,ts,this.model.activity||[]);

      this.seedPositions();
      this.empty.style.display=this.nodes.length?'none':'grid';
    }
'''
new_build = r'''    build(){
      const es=this.model.entities||[];
      const ws=this.model.wallets||[];
      const ts=this.model.tokens||[];
      this.nodes=[];
      this.edges=[];
      this.pulses=[];
      this.empty.style.display='none';

      if(this.mode==='global') this.buildGlobal(es);
      else if(this.focus==='token') this.buildTokenDetail(ts[0],es,this.model.activity||[]);
      else this.buildDetail(es[0],ws,ts,this.model.activity||[]);

      this.seedPositions();
      this.empty.style.display=this.nodes.length?'none':'grid';
    }
'''
s = replace_once(s, old_build, new_build, "graph build")

old_center = r'''      const center={
        kind:'entity',raw:entity||{},seed:hash((entity?.id||entity?.name||'entity')+':detail'),
        x:0,y:0,z:0,vx:0,vy:0,vz:0
      };
'''
new_center = r'''      const center={
        kind:'entity',raw:entity||{},seed:hash((entity?.id||entity?.name||'entity')+':detail'),
        anchor:true,
        x:0,y:0,z:0,vx:0,vy:0,vz:0
      };
'''
s = replace_once(s, old_center, new_center, "entity detail anchor")

memory_marker = "    memoryKey(n){return `${this.scope}:${n.kind}:${this.nodeKey(n)}`;}\n"
require(s, memory_marker, "graph memoryKey")

token_builder = r'''
    buildTokenDetail(token,entities,activity){
      const center={
        kind:'token',
        raw:token||{},
        seed:hash((token?.mint||token?.id||token?.symbol||'token')+':token-detail'),
        anchor:true,
        x:0,y:0,z:0,vx:0,vy:0,vz:0
      };
      this.nodes.push(center);

      const list=Array.isArray(entities)?entities:[];
      list.forEach((entity,i)=>{
        const seed=hash((entity?.id||entity?.name||entity?.x_handle||'entity')+':token-entity');
        const n={
          kind:'entity',
          raw:entity||{},
          seed,
          idx:i,
          total:list.length,
          x:0,y:0,z:0,vx:0,vy:0,vz:0,
          phase1:(seed%6283)/1000,
          phase2:((seed>>>8)%6283)/1000,
          freq1:.00024+((seed>>>16)%100)*.0000015,
          freq2:.00018+((seed>>>23)%80)*.0000013
        };
        this.nodes.push(n);
        this.edges.push({a:center,b:n,weight:1.25});
      });
    }

'''
if "buildTokenDetail(token,entities,activity)" not in s:
    s = s.replace(memory_marker, token_builder + memory_marker, 1)

old_radius_seed = r'''        if(this.mode==='detail'&&n.kind==='entity'){
          radius=.08;
        }else{
'''
new_radius_seed = r'''        if(this.mode==='detail'&&n.anchor){
          radius=this.focus==='token'?0:.08;
        }else{
'''
s = replace_once(s, old_radius_seed, new_radius_seed, "graph anchor seed")

radius_start = s.index("    radius(n,p=this.project(n)){")
radius_end = s.index("\n    label(n){", radius_start)
new_radius = r'''    radius(n,p=this.project(n)){
      const zoomSize=clamp(this.zoom,.50,1.45);
      let base;
      let maxRadius;

      if(this.mode==='global'){
        base=31;
        maxRadius=34;
      }else if(this.focus==='token'){
        if(n.kind==='token'){
          base=50;
          maxRadius=56;
        }else if(n.kind==='entity'){
          base=17;
          maxRadius=22;
        }else{
          base=16;
          maxRadius=21;
        }
      }else if(n.kind==='entity'){
        base=34;
        maxRadius=38;
      }else if(n.kind==='wallet'){
        base=18;
        maxRadius=24;
      }else{
        base=19;
        maxRadius=24;
      }

      return clamp(base*p.depth*zoomSize,10,maxRadius);
    }
'''
s = s[:radius_start] + new_radius + s[radius_end:]

old_label_block = r'''      if(this.mode==='detail'){
        c.fillStyle=dark?'#e7e9ea':'#0f1419';
        c.font=`${n.kind==='entity'?700:600} ${n.kind==='entity'?11:9}px Inter,system-ui`;
        c.textAlign='center';
        c.textBaseline='middle';
        c.fillText(this.label(n).slice(0,22),p.x,p.y+r+13);
        if(n.kind==='token'){
          const known=n.raw.pnlKnown,pct=Number(n.raw.pnlPercent),usd=Number(n.raw.pnlUsd);
          c.font='700 8px Inter,system-ui';
          c.fillStyle=known?(usd>=0?(dark?'#30d158':'#34c759'):(dark?'#ff453a':'#ff3b30')):(dark?'#71767b':'#536471');
          c.fillText(known?`${pct>=0?'+':''}${pct.toFixed(2)}%`:'P&L —',p.x,p.y+r+24);
          if(known){
            c.font='650 8px Inter,system-ui';
            c.fillText(money(usd),p.x,p.y+r+34);
          }
        }
      }
'''
new_label_block = r'''      if(this.mode==='detail'){
        const primary=this.focus==='token'?n.kind==='token':n.kind==='entity';

        c.fillStyle=dark?'#e7e9ea':'#0f1419';
        c.font=`${primary?700:600} ${primary?11:9}px Inter,system-ui`;
        c.textAlign='center';
        c.textBaseline='middle';
        c.fillText(this.label(n).slice(0,22),p.x,p.y+r+13);

        if(n.kind==='token'&&this.focus!=='token'){
          const known=n.raw.pnlKnown,pct=Number(n.raw.pnlPercent),usd=Number(n.raw.pnlUsd);
          c.font='700 8px Inter,system-ui';
          c.fillStyle=known?(usd>=0?(dark?'#30d158':'#34c759'):(dark?'#ff453a':'#ff3b30')):(dark?'#71767b':'#536471');
          c.fillText(known?`${pct>=0?'+':''}${pct.toFixed(2)}%`:'P&L —',p.x,p.y+r+24);
          if(known){
            c.font='650 8px Inter,system-ui';
            c.fillText(money(usd),p.x,p.y+r+34);
          }
        }
      }
'''
s = replace_once(s, old_label_block, new_label_block, "graph labels")

p.write_text(s)

print("Patched:")
print("  server.mjs")
print("  public/app.js")
print("  public/si-graph.js")
PY

node --check server.mjs
node --check public/app.js
node --check public/si-graph.js

echo
echo "Shadow token 3D patch applied successfully."
echo "No server restart was performed."
