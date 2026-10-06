
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) /api/tokens: attach only CURRENT holding Entities for each mint.
p = Path("server.mjs")
s = p.read_text()

old_tail = '''    const strict1hItems=await tokensWithMarketPeriods(db,items);
    return json(res,200,{
      items:strict1hItems,
      mode:'current-entity-holdings',
      authoritative:true
    });
'''
new_tail = r'''    /* SHADOW_TOKEN_HOLDER_ENTITIES_V390_API */
    const holderRows=db.prepare(`
      WITH current_positions AS (
        SELECT
          h.wallet_id,
          COALESCE(h.entity_id,w.entity_id) AS entity_id,
          h.mint,
          h.amount
        FROM wallet_holdings h
        JOIN wallets w ON w.id=h.wallet_id
        JOIN wallet_holdings_state s ON s.wallet_id=h.wallet_id
        WHERE w.entity_id IS NOT NULL
          AND COALESCE(s.last_success_at,'')<>''
          AND h.amount>1e-12

        UNION ALL

        SELECT
          a.wallet_id,
          COALESCE(a.entity_id,w.entity_id) AS entity_id,
          a.mint,
          SUM(COALESCE(a.token_amount,0)) AS amount
        FROM wallet_activity a
        JOIN wallets w ON w.id=a.wallet_id
        LEFT JOIN wallet_holdings_state s ON s.wallet_id=a.wallet_id
        WHERE w.entity_id IS NOT NULL
          AND COALESCE(s.last_success_at,'')=''
          AND COALESCE(a.mint,'')<>''
        GROUP BY a.wallet_id,COALESCE(a.entity_id,w.entity_id),a.mint
        HAVING SUM(COALESCE(a.token_amount,0))>1e-12
      )
      SELECT
        cp.mint,
        e.id,
        e.name,
        e.avatar,
        e.x_handle,
        SUM(cp.amount) AS amount
      FROM current_positions cp
      JOIN entities e ON e.id=cp.entity_id
      WHERE cp.entity_id IS NOT NULL
      GROUP BY cp.mint,e.id,e.name,e.avatar,e.x_handle
      HAVING SUM(cp.amount)>1e-12
      ORDER BY cp.mint,LOWER(COALESCE(e.name,'')),e.created_at
    `).all();

    const holdersByMint=new Map();
    for(const row of holderRows){
      const mint=String(row.mint||'');
      if(!holdersByMint.has(mint))holdersByMint.set(mint,[]);
      holdersByMint.get(mint).push({
        id:row.id,
        name:row.name,
        avatar:row.avatar||'',
        xHandle:row.x_handle||'',
        amount:Number(row.amount||0)
      });
    }

    const strict1hItems=(await tokensWithMarketPeriods(db,items)).map(token=>({
      ...token,
      holderEntities:holdersByMint.get(String(token.mint||''))||[]
    }));
    /* SHADOW_TOKEN_HOLDER_ENTITIES_V390_API_END */

    return json(res,200,{
      items:strict1hItems,
      mode:'current-entity-holdings',
      authoritative:true
    });
'''
s = replace_once(s, old_tail, new_tail, "tokens current-holder payload")
p.write_text(s)

# 2) Tokens UI: compact avatar stack immediately after token symbol.
p = Path("public/app.js")
s = p.read_text()

render_marker = "function renderTokens(){\n"
if "SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP" not in s:
    helpers = r'''/* SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP */
function tokenHolderEntities(token){
  const rows=Array.isArray(token?.holderEntities)?token.holderEntities:[];
  const seen=new Set();
  return rows.filter(entity=>{
    const id=String(entity?.id||'').trim();
    if(!id||seen.has(id))return false;
    seen.add(id);
    return true;
  });
}

function tokenHolderStackHtml(token){
  const holders=tokenHolderEntities(token);
  if(!holders.length)return '';

  const visible=holders.slice(0,3);
  const more=holders.length-visible.length;

  const avatars=visible.map(entity=>{
    const label=String(entity?.name||entity?.xHandle||'Entity').trim()||'Entity';
    return `<button
      type="button"
      class="si-token-holder"
      data-token-holder-entity="${esc(entity.id)}"
      aria-label="Open ${esc(label)}"
      title="${esc(label)}"
    >${avatar(entity,'sm')}</button>`;
  }).join('');

  const extra=more>0
    ? `<span class="si-token-holder-more" title="${holders.length} Entities holding this token">+${more}</span>`
    : '';

  return `<span class="si-token-holder-stack" aria-label="${holders.length} Entities currently holding this token">${avatars}${extra}</span>`;
}
/* SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP_END */

'''
    if render_marker not in s:
        raise SystemExit("ERROR: renderTokens marker not found")
    s = s.replace(render_marker, helpers + render_marker, 1)

old_symbol = '''      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
'''
new_symbol = '''      <div>
        <div class="si-token-title-row">
          <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
          ${tokenHolderStackHtml(t)}
        </div>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
'''
s = replace_once(s, old_symbol, new_symbol, "token title holder stack")

old_click = '''  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;
    openObject('token',{mint:x.dataset.token});
  });
'''
new_click = '''  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;

    const holder=event.target.closest('[data-token-holder-entity]');
    if(holder){
      event.preventDefault();
      event.stopPropagation();
      openObject('entity',{id:holder.dataset.tokenHolderEntity});
      return;
    }

    openObject('token',{mint:x.dataset.token});
  });
'''
s = replace_once(s, old_click, new_click, "token holder entity click")
p.write_text(s)

# 3) Strict compact styling.
p = Path("public/si-current.css")
s = p.read_text()

if "SHADOW_TOKEN_HOLDER_ENTITIES_V390_CSS" not in s:
    s += r'''

/* SHADOW_TOKEN_HOLDER_ENTITIES_V390_CSS */
.si-token-title-row{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  max-width:100%;
}
.si-token-title-row>.si-token-symbol{
  flex:0 1 auto;
  min-width:0;
}
.si-token-holder-stack{
  display:inline-flex;
  align-items:center;
  flex:0 0 auto;
  min-width:0;
  height:24px;
}
.si-token-holder{
  appearance:none;
  -webkit-appearance:none;
  position:relative;
  width:22px;
  height:22px;
  min-width:22px;
  padding:0;
  margin:0 0 0 -5px;
  border:1.5px solid var(--si-panel);
  border-radius:50%;
  overflow:hidden;
  background:var(--si-panel);
  cursor:pointer;
  box-shadow:none;
  -webkit-tap-highlight-color:transparent;
}
.si-token-holder:first-child{margin-left:0}
.si-token-holder .avatar{
  width:100%!important;
  height:100%!important;
  min-width:100%!important;
  display:block!important;
  border:0!important;
  border-radius:50%!important;
  box-shadow:none!important;
  background-size:cover!important;
  background-position:center!important;
}
.si-token-holder-more{
  display:inline-grid;
  place-items:center;
  height:22px;
  min-width:22px;
  padding:0 5px;
  margin-left:-4px;
  border:1.5px solid var(--si-panel);
  border-radius:999px;
  background:var(--si-line);
  color:var(--si-muted);
  font-size:9px;
  font-weight:800;
  line-height:1;
}
.si-token-holder:active{transform:scale(.94)}
/* SHADOW_TOKEN_HOLDER_ENTITIES_V390_CSS_END */
'''

p.write_text(s)

print("Patched:")
print("  server.mjs")
print("  public/app.js")
print("  public/si-current.css")
