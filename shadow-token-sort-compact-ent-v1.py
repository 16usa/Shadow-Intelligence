
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

p = Path("public/app.js")
s = p.read_text()

mc_state = '''let tokenMcDirection=(()=>{
  try{
    return localStorage.getItem('si-token-mc-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();
'''
ent_state = mc_state + '''
/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_STATE */
let tokenEntityDirection=(()=>{
  try{
    return localStorage.getItem('si-token-entity-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();

let tokenPeriodMenuOpen=false;

function tokenPeriodLabel(period=tokenPeriod){
  if(period==='m1')return '1M';
  if(period==='m5')return '5M';
  if(period==='h1')return '1H';
  if(period==='h6')return '6H';
  if(period==='h24')return '24H';
  return '1H';
}
/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_STATE_END */
'''
if "SHADOW_TOKEN_SORT_COMPACT_ENT_V391_STATE" not in s:
    s = replace_once(s, mc_state, ent_state, "ENT direction state")

old_mc_ranks = '''  const mcRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(token?.market_cap,null),
    tokenMcDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const scored=out.map((token,index)=>{
'''
new_mc_ranks = '''  const mcRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(token?.market_cap,null),
    tokenMcDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const entityRanks=buildPercentileRanks(
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
if "const entityRanks=buildPercentileRanks(" not in s:
    s = replace_once(s, old_mc_ranks, new_mc_ranks, "ENT percentile rank")

old_score = '''    const mc=mcRanks.get(key)??0;

    return {
      token,
      index,
      price,
      age,
      mc,
      total:(price+age+mc)/3
    };
  });

  scored.sort((a,b)=>
    b.total-a.total
    || b.price-a.price
    || b.age-a.age
    || b.mc-a.mc
    || a.index-b.index
  );
'''
new_score = '''    const mc=mcRanks.get(key)??0;
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
if "total:(price+age+mc+entities)/4" not in s:
    s = replace_once(s, old_score, new_score, "ENT joint sorting")

start = s.find("function ensureTokenSortControls(){")
end_marker = "/* SHADOW_TOKEN_HOLDER_ENTITIES_V390_APP */"
end = s.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("ERROR: token sort controls block not found")

new_controls = r'''function ensureTokenSortControls(){
  const grid=$('#tokensGrid');
  if(!grid)return;

  let wrap=$('#tokenSortWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='tokenSortWrap';
    wrap.className='si-token-sort-wrap';
    grid.before(wrap);
  }

  const periodOptions=[
    ['m1','1M'],
    ['m5','5M'],
    ['h1','1H'],
    ['h6','6H'],
    ['h24','24H']
  ];

  wrap.innerHTML=`
    <div class="si-token-sort si-token-sort-compact" role="group" aria-label="Token joint sorting">
      <div class="si-token-period-control">
        <button
          type="button"
          class="is-active si-token-period-trigger"
          data-token-period-toggle
          aria-haspopup="menu"
          aria-expanded="${tokenPeriodMenuOpen?'true':'false'}"
        >
          <span>${tokenPeriodLabel()}</span>
          <span class="si-token-period-chevron" aria-hidden="true">${tokenPeriodMenuOpen?'⌃':'⌄'}</span>
        </button>

        <div class="si-token-period-menu ${tokenPeriodMenuOpen?'is-open':''}" role="menu">
          ${periodOptions.map(([period,label])=>`
            <button
              type="button"
              role="menuitem"
              data-token-period="${period}"
              class="${period===tokenPeriod?'is-selected':''}"
            >${label}</button>
          `).join('')}
        </div>
      </div>

      <button type="button" data-token-age class="is-active">
        Age ${tokenAgeDirection==='youngest'?'↓':'↑'}
      </button>

      <button type="button" data-token-mc class="is-active">
        MC ${tokenMcDirection==='desc'?'↓':'↑'}
      </button>

      <button type="button" data-token-ent class="is-active" title="Current holding Entities">
        ENT ${tokenEntityDirection==='desc'?'↓':'↑'}
      </button>
    </div>`;

  const periodToggle=wrap.querySelector('[data-token-period-toggle]');
  if(periodToggle){
    periodToggle.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();
      tokenPeriodMenuOpen=!tokenPeriodMenuOpen;
      ensureTokenSortControls();
    };
  }

  wrap.querySelectorAll('[data-token-period]').forEach(button=>{
    button.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();

      tokenPeriod=button.dataset.tokenPeriod;
      tokenPeriodMenuOpen=false;

      try{
        localStorage.setItem('si-token-period',tokenPeriod);
      }catch{}

      renderTokens();
    };
  });

  const ageButton=wrap.querySelector('[data-token-age]');
  if(ageButton){
    ageButton.setAttribute('aria-pressed','true');
    ageButton.onclick=()=>{
      tokenPeriodMenuOpen=false;
      tokenAgeDirection=tokenAgeDirection==='youngest'
        ? 'oldest'
        : 'youngest';

      try{
        localStorage.setItem('si-token-age-direction',tokenAgeDirection);
      }catch{}

      renderTokens();
    };
  }

  const mcButton=wrap.querySelector('[data-token-mc]');
  if(mcButton){
    mcButton.setAttribute('aria-pressed','true');
    mcButton.onclick=()=>{
      tokenPeriodMenuOpen=false;
      tokenMcDirection=tokenMcDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-mc-direction',tokenMcDirection);
      }catch{}

      renderTokens();
    };
  }

  const entButton=wrap.querySelector('[data-token-ent]');
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

/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_OUTSIDE */
if(!window.__shadowTokenPeriodOutsideBound){
  window.__shadowTokenPeriodOutsideBound=true;

  document.addEventListener('click',event=>{
    if(!tokenPeriodMenuOpen)return;
    if(event.target.closest('#tokenSortWrap'))return;

    tokenPeriodMenuOpen=false;
    if(currentPage==='tokens')ensureTokenSortControls();
  });

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || !tokenPeriodMenuOpen)return;

    tokenPeriodMenuOpen=false;
    if(currentPage==='tokens')ensureTokenSortControls();
  });
}
/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_OUTSIDE_END */

'''
s = s[:start] + new_controls + s[end:]

s = s.replace(
'''    TRUE JOINT SORT:
      1) selected period price-change rank
      2) Age rank
      3) MC rank

    All three are active at the same time with equal weight.
''',
'''    TRUE JOINT SORT:
      1) selected period price-change rank
      2) Age rank
      3) MC rank
      4) current holding-Entity count rank

    All four are active at the same time with equal weight.
''',
1
)

p.write_text(s)

p = Path("public/si-current.css")
s = p.read_text()

if "SHADOW_TOKEN_SORT_COMPACT_ENT_V391_CSS" not in s:
    s += r'''

/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_CSS */
.si-token-sort-wrap{
  position:relative!important;
  z-index:25!important;
}
.si-token-sort.si-token-sort-compact{
  display:grid!important;
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  width:100%!important;
  overflow:visible!important;
}
.si-token-sort.si-token-sort-compact>button,
.si-token-sort.si-token-sort-compact .si-token-period-trigger{
  width:100%!important;
  min-width:0!important;
  height:44px!important;
  padding:0 10px!important;
  white-space:nowrap!important;
}
.si-token-period-control{
  position:relative!important;
  min-width:0!important;
}
.si-token-period-trigger{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:6px!important;
}
.si-token-period-chevron{
  display:inline-block!important;
  font-size:11px!important;
  line-height:1!important;
  opacity:.7!important;
}
.si-token-period-menu{
  position:absolute!important;
  z-index:90!important;
  top:calc(100% + 8px)!important;
  left:0!important;
  width:112px!important;
  display:none!important;
  padding:6px!important;
  border:1px solid var(--si-line)!important;
  border-radius:14px!important;
  background:var(--si-panel)!important;
  box-shadow:0 12px 30px rgba(0,0,0,.28)!important;
}
.si-token-period-menu.is-open{
  display:grid!important;
}
.si-token-period-menu button{
  width:100%!important;
  min-height:38px!important;
  padding:0 12px!important;
  border:0!important;
  border-radius:9px!important;
  background:transparent!important;
  color:var(--si-muted)!important;
  text-align:left!important;
  font:inherit!important;
  font-weight:700!important;
  cursor:pointer!important;
}
.si-token-period-menu button.is-selected{
  background:var(--si-line)!important;
  color:var(--si-text)!important;
}
.si-token-period-menu button:active{
  opacity:.65!important;
}
@media(max-width:520px){
  .si-token-sort.si-token-sort-compact>button,
  .si-token-sort.si-token-sort-compact .si-token-period-trigger{
    padding:0 7px!important;
    font-size:12px!important;
  }
}
/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_CSS_END */
'''

p.write_text(s)

print("Patched:")
print("  public/app.js")
print("  public/si-current.css")
