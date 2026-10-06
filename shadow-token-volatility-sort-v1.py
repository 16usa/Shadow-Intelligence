
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

p = Path("public/app.js")
s = p.read_text()

entity_state = '''let tokenEntityDirection=(()=>{
  try{
    return localStorage.getItem('si-token-entity-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();
'''
vol_state = entity_state + '''
/* SHADOW_TOKEN_VOLATILITY_SORT_V393_STATE */
let tokenVolatilityDirection=(()=>{
  try{
    return localStorage.getItem('si-token-volatility-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();
/* SHADOW_TOKEN_VOLATILITY_SORT_V393_STATE_END */
'''
if "SHADOW_TOKEN_VOLATILITY_SORT_V393_STATE" not in s:
    s = replace_once(s, entity_state, vol_state, "volatility direction state")

change_fn = '''function tokenChangeForPeriod(token,period=tokenPeriod){
  if(period==='m1')return token?.price_change_1m;
  if(period==='m5')return token?.price_change_5m;
  if(period==='h1')return token?.price_change_1h ?? token?.price_change;
  if(period==='h6')return token?.price_change_6h;
  if(period==='h24')return token?.price_change_24h;
  return token?.price_change_1h ?? token?.price_change;
}
'''
vol_fn = change_fn + '''
/* SHADOW_TOKEN_VOLATILITY_SORT_V393_VALUE */
function tokenVolatilityForPeriod(token,period=tokenPeriod){
  const change=tokenSortNumber(tokenChangeForPeriod(token,period),null);
  return Number.isFinite(change)?Math.abs(change):null;
}
/* SHADOW_TOKEN_VOLATILITY_SORT_V393_VALUE_END */
'''
if "SHADOW_TOKEN_VOLATILITY_SORT_V393_VALUE" not in s:
    s = replace_once(s, change_fn, vol_fn, "volatility value helper")

old_entity_rank = '''  const entityRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(
      token?.holder_entities ?? token?.holderEntities?.length,
      null
    ),
    tokenEntityDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const scored=out.map((token,index)=>{
'''
new_entity_rank = '''  const entityRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(
      token?.holder_entities ?? token?.holderEntities?.length,
      null
    ),
    tokenEntityDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const volatilityRanks=buildPercentileRanks(
    out,
    token=>tokenVolatilityForPeriod(token),
    tokenVolatilityDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)
  );

  const scored=out.map((token,index)=>{
'''
if "const volatilityRanks=buildPercentileRanks(" not in s:
    s = replace_once(s, old_entity_rank, new_entity_rank, "volatility percentile rank")

old_score = '''    const mc=mcRanks.get(key)??0;
    const entities=entityRanks.get(key)??0;

    return {
      token,
      index,
      price,
      age,
      mc,
      entities,
      total:(price+age+mc+entities)/4
    };
  });

  scored.sort((a,b)=>
    b.total-a.total
    || b.price-a.price
    || b.age-a.age
    || b.mc-a.mc
    || b.entities-a.entities
    || a.index-b.index
  );
'''
new_score = '''    const mc=mcRanks.get(key)??0;
    const entities=entityRanks.get(key)??0;
    const volatility=volatilityRanks.get(key)??0;

    return {
      token,
      index,
      price,
      age,
      mc,
      entities,
      volatility,
      total:(price+age+mc+entities+volatility)/5
    };
  });

  scored.sort((a,b)=>
    b.total-a.total
    || b.price-a.price
    || b.age-a.age
    || b.mc-a.mc
    || b.entities-a.entities
    || b.volatility-a.volatility
    || a.index-b.index
  );
'''
if "total:(price+age+mc+entities+volatility)/5" not in s:
    s = replace_once(s, old_score, new_score, "volatility joint score")

s = s.replace(
'''      4) current holding-Entity count rank

    All four are active at the same time with equal weight.
''',
'''      4) current holding-Entity count rank
      5) selected-period volatility rank (absolute % move)

    All five are active at the same time with equal weight.
''',
1
)

old_ent_button = '''      <button type="button" data-token-ent class="is-active" title="Current holding Entities">
        ENT ${tokenEntityDirection==='desc'?'↓':'↑'}
      </button>
    </div>`;
'''
new_ent_button = '''      <button type="button" data-token-ent class="is-active" title="Current holding Entities">
        ENT ${tokenEntityDirection==='desc'?'↓':'↑'}
      </button>

      <button type="button" data-token-vol class="is-active" title="Price movement amplitude for the selected period">
        VOL ${tokenVolatilityDirection==='desc'?'↓':'↑'}
      </button>
    </div>`;
'''
s = replace_once(s, old_ent_button, new_ent_button, "VOL sort button")

ent_handler = '''  const entButton=wrap.querySelector('[data-token-ent]');
  if(entButton){
    entButton.setAttribute('aria-pressed','true');
    entButton.onclick=()=>{
      tokenPeriodMenuOpen=false;
      tokenEntityDirection=tokenEntityDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-entity-direction',tokenEntityDirection);
      }catch{}

      renderTokens();
    };
  }
}
'''
vol_handler = '''  const entButton=wrap.querySelector('[data-token-ent]');
  if(entButton){
    entButton.setAttribute('aria-pressed','true');
    entButton.onclick=()=>{
      tokenPeriodMenuOpen=false;
      tokenEntityDirection=tokenEntityDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-entity-direction',tokenEntityDirection);
      }catch{}

      renderTokens();
    };
  }

  const volButton=wrap.querySelector('[data-token-vol]');
  if(volButton){
    volButton.setAttribute('aria-pressed','true');
    volButton.onclick=()=>{
      tokenPeriodMenuOpen=false;
      tokenVolatilityDirection=tokenVolatilityDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-volatility-direction',tokenVolatilityDirection);
      }catch{}

      renderTokens();
    };
  }
}
'''
s = replace_once(s, ent_handler, vol_handler, "VOL button handler")

p.write_text(s)

p = Path("public/si-current.css")
s = p.read_text()

old_grid = "  grid-template-columns:repeat(4,minmax(0,1fr))!important;\n"
new_grid = "  grid-template-columns:repeat(5,minmax(0,1fr))!important;\n"
if old_grid in s:
    s = s.replace(old_grid, new_grid, 1)
elif new_grid not in s:
    raise SystemExit("ERROR: compact token sort grid definition not found")

if "SHADOW_TOKEN_VOLATILITY_SORT_V393_CSS" not in s:
    s += r'''

/* SHADOW_TOKEN_VOLATILITY_SORT_V393_CSS */
@media(max-width:520px){
  .si-token-sort.si-token-sort-compact>button,
  .si-token-sort.si-token-sort-compact .si-token-period-trigger{
    padding-left:5px!important;
    padding-right:5px!important;
    font-size:11px!important;
  }
}
/* SHADOW_TOKEN_VOLATILITY_SORT_V393_CSS_END */
'''

p.write_text(s)

print("Patched:")
print("  public/app.js")
print("  public/si-current.css")
print()
print("VOL uses absolute selected-period % change:")
print("  +25% -> 25 volatility")
print("  -25% -> 25 volatility")
print("VOL down = more volatile gets the higher rank.")
print("VOL up = less volatile gets the higher rank.")
print("Joint ranking is now 5 equal criteria (20% each).")
