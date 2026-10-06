
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"ERROR: {label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"ERROR: {label}: end marker not found")
    return text[:start] + replacement + text[end:]

p = Path("public/app.js")
s = p.read_text()

state_anchor = '''let tokenPeriodMenuOpen=false;

function tokenPeriodLabel(period=tokenPeriod){
'''
state_block = '''/* SHADOW_TOKEN_SORT_SELECTIVE_V395_STATE */
function tokenSortEnabledState(storageKey){
  try{
    return localStorage.getItem(storageKey)!=='0';
  }catch{
    return true;
  }
}

let tokenPriceEnabled=tokenSortEnabledState('si-token-price-enabled');
let tokenAgeEnabled=tokenSortEnabledState('si-token-age-enabled');
let tokenMcEnabled=tokenSortEnabledState('si-token-mc-enabled');
let tokenEntityEnabled=tokenSortEnabledState('si-token-entity-enabled');
let tokenVolatilityEnabled=tokenSortEnabledState('si-token-volatility-enabled');

function saveTokenSortEnabled(storageKey,enabled){
  try{
    localStorage.setItem(storageKey,enabled?'1':'0');
  }catch{}
}
/* SHADOW_TOKEN_SORT_SELECTIVE_V395_STATE_END */

let tokenPeriodMenuOpen=false;

function tokenPeriodLabel(period=tokenPeriod){
'''
if "SHADOW_TOKEN_SORT_SELECTIVE_V395_STATE" not in s:
    s = replace_once(s, state_anchor, state_block, "selective sort state")

new_sorted = r'''function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  /*
    SELECTIVE JOINT SORT:
      - selected-period price change
      - Age
      - MC
      - current holding Entity count
      - selected-period volatility (absolute % move)

    Only enabled criteria participate.
    Every enabled criterion has equal weight.
    If everything is OFF, keep the source order unchanged.
  */

  const activeCount=[
    tokenPriceEnabled,
    tokenAgeEnabled,
    tokenMcEnabled,
    tokenEntityEnabled,
    tokenVolatilityEnabled
  ].filter(Boolean).length;

  if(!activeCount)return out;

  const priceRanks=tokenPriceEnabled
    ? buildPercentileRanks(
        out,
        token=>tokenSortNumber(tokenChangeForPeriod(token),null),
        'desc',
        value=>Number.isFinite(value)
      )
    : new Map();

  const ageRanks=tokenAgeEnabled
    ? buildPercentileRanks(
        out,
        token=>tokenAgeSortValue(token),
        tokenAgeDirection==='oldest'?'desc':'asc',
        value=>Number.isFinite(value)&&value>0
      )
    : new Map();

  const mcRanks=tokenMcEnabled
    ? buildPercentileRanks(
        out,
        token=>tokenSortNumber(token?.market_cap,null),
        tokenMcDirection==='desc'?'desc':'asc',
        value=>Number.isFinite(value)&&value>0
      )
    : new Map();

  const entityRanks=tokenEntityEnabled
    ? buildPercentileRanks(
        out,
        token=>tokenSortNumber(
          token?.holder_entities ?? token?.holderEntities?.length,
          null
        ),
        tokenEntityDirection==='desc'?'desc':'asc',
        value=>Number.isFinite(value)&&value>0
      )
    : new Map();

  const volatilityRanks=tokenVolatilityEnabled
    ? buildPercentileRanks(
        out,
        token=>tokenVolatilityForPeriod(token),
        tokenVolatilityDirection==='desc'?'desc':'asc',
        value=>Number.isFinite(value)
      )
    : new Map();

  const scored=out.map((token,index)=>{
    const key=tokenRankKey(token,index);

    const price=tokenPriceEnabled ? (priceRanks.get(key)??0) : 0;
    const age=tokenAgeEnabled ? (ageRanks.get(key)??0) : 0;
    const mc=tokenMcEnabled ? (mcRanks.get(key)??0) : 0;
    const entities=tokenEntityEnabled ? (entityRanks.get(key)??0) : 0;
    const volatility=tokenVolatilityEnabled ? (volatilityRanks.get(key)??0) : 0;

    return {
      token,
      index,
      price,
      age,
      mc,
      entities,
      volatility,
      total:(price+age+mc+entities+volatility)/activeCount
    };
  });

  scored.sort((a,b)=>
    b.total-a.total
    || (tokenPriceEnabled ? b.price-a.price : 0)
    || (tokenAgeEnabled ? b.age-a.age : 0)
    || (tokenMcEnabled ? b.mc-a.mc : 0)
    || (tokenEntityEnabled ? b.entities-a.entities : 0)
    || (tokenVolatilityEnabled ? b.volatility-a.volatility : 0)
    || a.index-b.index
  );

  return scored.map(row=>row.token);
}


'''
s = replace_between(
    s,
    "function sortedTokenRows(rows){",
    "function ensureTokenSortControls(){",
    new_sorted,
    "selective joint sorting"
)

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
          class="${tokenPriceEnabled?'is-active':'is-off'} si-token-period-trigger"
          data-token-period-toggle
          aria-haspopup="menu"
          aria-expanded="${tokenPeriodMenuOpen?'true':'false'}"
          aria-pressed="${tokenPriceEnabled?'true':'false'}"
          title="Price change for selected time period"
        >
          <span>${tokenPeriodLabel()}${tokenPriceEnabled?'':' ×'}</span>
          <span class="si-token-period-chevron" aria-hidden="true">${tokenPeriodMenuOpen?'⌃':'⌄'}</span>
        </button>

        <div class="si-token-period-menu ${tokenPeriodMenuOpen?'is-open':''}" role="menu">
          ${periodOptions.map(([period,label])=>`
            <button
              type="button"
              role="menuitem"
              data-token-period="${period}"
              class="${tokenPriceEnabled&&period===tokenPeriod?'is-selected':''}"
            >${label}</button>
          `).join('')}
          <button
            type="button"
            role="menuitem"
            data-token-period-off
            class="si-token-period-off ${!tokenPriceEnabled?'is-selected':''}"
          >Off</button>
        </div>
      </div>

      <button
        type="button"
        data-token-age
        class="${tokenAgeEnabled?'is-active':'is-off'}"
        aria-pressed="${tokenAgeEnabled?'true':'false'}"
      >
        ${tokenAgeEnabled?`Age ${tokenAgeDirection==='oldest'?'↓':'↑'}`:'Age OFF'}
      </button>

      <button
        type="button"
        data-token-mc
        class="${tokenMcEnabled?'is-active':'is-off'}"
        aria-pressed="${tokenMcEnabled?'true':'false'}"
      >
        ${tokenMcEnabled?`MC ${tokenMcDirection==='desc'?'↓':'↑'}`:'MC OFF'}
      </button>

      <button
        type="button"
        data-token-ent
        class="${tokenEntityEnabled?'is-active':'is-off'}"
        aria-pressed="${tokenEntityEnabled?'true':'false'}"
        title="Current holding Entities"
      >
        ${tokenEntityEnabled?`ENT ${tokenEntityDirection==='desc'?'↓':'↑'}`:'ENT OFF'}
      </button>

      <button
        type="button"
        data-token-vol
        class="${tokenVolatilityEnabled?'is-active':'is-off'}"
        aria-pressed="${tokenVolatilityEnabled?'true':'false'}"
        title="Price movement amplitude for the selected period"
      >
        ${tokenVolatilityEnabled?`VOL ${tokenVolatilityDirection==='desc'?'↓':'↑'}`:'VOL OFF'}
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
      tokenPriceEnabled=true;
      tokenPeriodMenuOpen=false;

      try{
        localStorage.setItem('si-token-period',tokenPeriod);
      }catch{}
      saveTokenSortEnabled('si-token-price-enabled',true);

      renderTokens();
    };
  });

  const periodOff=wrap.querySelector('[data-token-period-off]');
  if(periodOff){
    periodOff.onclick=event=>{
      event.preventDefault();
      event.stopPropagation();

      // Keep the selected period because VOL still uses it.
      tokenPriceEnabled=false;
      tokenPeriodMenuOpen=false;
      saveTokenSortEnabled('si-token-price-enabled',false);

      renderTokens();
    };
  }

  const ageButton=wrap.querySelector('[data-token-age]');
  if(ageButton){
    ageButton.onclick=()=>{
      tokenPeriodMenuOpen=false;

      if(!tokenAgeEnabled){
        tokenAgeEnabled=true;
        tokenAgeDirection='oldest';
      }else if(tokenAgeDirection==='oldest'){
        tokenAgeDirection='youngest';
      }else{
        tokenAgeEnabled=false;
      }

      try{
        localStorage.setItem('si-token-age-direction',tokenAgeDirection);
      }catch{}
      saveTokenSortEnabled('si-token-age-enabled',tokenAgeEnabled);

      renderTokens();
    };
  }

  const mcButton=wrap.querySelector('[data-token-mc]');
  if(mcButton){
    mcButton.onclick=()=>{
      tokenPeriodMenuOpen=false;

      if(!tokenMcEnabled){
        tokenMcEnabled=true;
        tokenMcDirection='desc';
      }else if(tokenMcDirection==='desc'){
        tokenMcDirection='asc';
      }else{
        tokenMcEnabled=false;
      }

      try{
        localStorage.setItem('si-token-mc-direction',tokenMcDirection);
      }catch{}
      saveTokenSortEnabled('si-token-mc-enabled',tokenMcEnabled);

      renderTokens();
    };
  }

  const entButton=wrap.querySelector('[data-token-ent]');
  if(entButton){
    entButton.onclick=()=>{
      tokenPeriodMenuOpen=false;

      if(!tokenEntityEnabled){
        tokenEntityEnabled=true;
        tokenEntityDirection='desc';
      }else if(tokenEntityDirection==='desc'){
        tokenEntityDirection='asc';
      }else{
        tokenEntityEnabled=false;
      }

      try{
        localStorage.setItem('si-token-entity-direction',tokenEntityDirection);
      }catch{}
      saveTokenSortEnabled('si-token-entity-enabled',tokenEntityEnabled);

      renderTokens();
    };
  }

  const volButton=wrap.querySelector('[data-token-vol]');
  if(volButton){
    volButton.onclick=()=>{
      tokenPeriodMenuOpen=false;

      if(!tokenVolatilityEnabled){
        tokenVolatilityEnabled=true;
        tokenVolatilityDirection='desc';
      }else if(tokenVolatilityDirection==='desc'){
        tokenVolatilityDirection='asc';
      }else{
        tokenVolatilityEnabled=false;
      }

      try{
        localStorage.setItem('si-token-volatility-direction',tokenVolatilityDirection);
      }catch{}
      saveTokenSortEnabled('si-token-volatility-enabled',tokenVolatilityEnabled);

      renderTokens();
    };
  }
}

'''
s = replace_between(
    s,
    "function ensureTokenSortControls(){",
    "/* SHADOW_TOKEN_SORT_COMPACT_ENT_V391_OUTSIDE */",
    new_controls,
    "selective sort controls"
)

p.write_text(s)

p = Path("public/si-current.css")
s = p.read_text()

if "SHADOW_TOKEN_SORT_SELECTIVE_V395_CSS" not in s:
    s += r'''

/* SHADOW_TOKEN_SORT_SELECTIVE_V395_CSS */
.si-token-sort.si-token-sort-compact .is-off{
  background:var(--si-panel)!important;
  color:var(--si-muted)!important;
  opacity:.58!important;
}
.si-token-sort.si-token-sort-compact .is-off:active{
  opacity:.78!important;
}
.si-token-period-menu .si-token-period-off{
  margin-top:5px!important;
  padding-top:9px!important;
  border-top:1px solid var(--si-line)!important;
  border-radius:0 0 9px 9px!important;
}
.si-token-period-menu .si-token-period-off.is-selected{
  color:var(--si-text)!important;
  opacity:.72!important;
}
@media(max-width:520px){
  .si-token-sort.si-token-sort-compact>button,
  .si-token-sort.si-token-sort-compact .si-token-period-trigger{
    letter-spacing:-.01em!important;
  }
}
/* SHADOW_TOKEN_SORT_SELECTIVE_V395_CSS_END */
'''

p.write_text(s)

print("Patched:")
print("  public/app.js")
print("  public/si-current.css")
print()
print("Selective sort behavior:")
print("  Time popup: 1M / 5M / 1H / 6H / 24H / Off")
print("  Age: down -> up -> OFF -> down")
print("  MC:  down -> up -> OFF -> down")
print("  ENT: down -> up -> OFF -> down")
print("  VOL: down -> up -> OFF -> down")
print("  Active criteria automatically share equal weight.")
print("  If time is OFF, selected period is preserved for VOL.")
