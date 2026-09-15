
from pathlib import Path
import re

app_path = Path("public/app.js")
html_path = Path("public/index.html")

if not app_path.exists() or not html_path.exists():
    raise SystemExit("ERROR: public/app.js or public/index.html not found")

app = app_path.read_text(encoding="utf-8")
html = html_path.read_text(encoding="utf-8")

start = "/* SHADOW_TOKENS_JOINT_SORT_V268_START */"
end = "/* SHADOW_TOKENS_JOINT_SORT_V268_END */"

i = app.find(start)
j = app.find(end, i)
if i < 0 or j < 0:
    raise SystemExit("ERROR: v2.6.8 joint-sort block not found")
j += len(end)

ui = r'''/* SHADOW_TOKENS_JOINT_RANK_V269_START */
let tokenPeriod=(()=>{
  try{
    const saved=localStorage.getItem('si-token-period');
    if(['m1','m5','h1','h6','h24'].includes(saved))return saved;

    const legacy=localStorage.getItem('si-token-sort');
    if(['m1','m5','h1','h6','h24'].includes(legacy))return legacy;
    if(legacy==='top1h')return 'h1';

    return 'h1';
  }catch{
    return 'h1';
  }
})();

let tokenAgeDirection=(()=>{
  try{
    return localStorage.getItem('si-token-age-direction')==='oldest'
      ? 'oldest'
      : 'youngest';
  }catch{
    return 'youngest';
  }
})();

let tokenMcDirection=(()=>{
  try{
    return localStorage.getItem('si-token-mc-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();

function tokenSortNumber(value,fallback=null){
  if(value==null||value==='')return fallback;
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function tokenCreatedTimestamp(token){
  const raw=token?.token_created_at||token?.token_market_created_at||'';
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:0;
}

function tokenAgeLabel(token){
  const created=tokenCreatedTimestamp(token);
  if(!created)return '—';

  const minutes=Math.max(0,Math.floor((Date.now()-created)/60000));
  if(minutes<1)return '<1m';
  if(minutes<60)return `${minutes}m`;

  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h`;

  const days=Math.floor(hours/24);
  if(days<30)return `${days}d`;

  const months=Math.floor(days/30);
  if(months<12)return `${months}mo`;

  return `${Math.floor(days/365)}y`;
}

function tokenChangeForPeriod(token,period=tokenPeriod){
  if(period==='m1')return token?.price_change_1m;
  if(period==='m5')return token?.price_change_5m;
  if(period==='h1')return token?.price_change_1h ?? token?.price_change;
  if(period==='h6')return token?.price_change_6h;
  if(period==='h24')return token?.price_change_24h;
  return token?.price_change_1h ?? token?.price_change;
}

function tokenRankKey(token,index){
  return String(token?.mint||token?.id||`row-${index}`);
}

function buildPercentileRanks(rows,valueGetter,direction='desc',validGetter=null){
  const ranked=[];

  rows.forEach((token,index)=>{
    const value=valueGetter(token);
    const valid=validGetter ? !!validGetter(value,token) : Number.isFinite(value);

    if(valid){
      ranked.push({
        key:tokenRankKey(token,index),
        value:Number(value),
        index
      });
    }
  });

  ranked.sort((a,b)=>{
    if(a.value===b.value)return a.index-b.index;
    return direction==='asc'
      ? a.value-b.value
      : b.value-a.value;
  });

  const scores=new Map();
  const n=ranked.length;

  if(!n)return scores;
  if(n===1){
    scores.set(ranked[0].key,1);
    return scores;
  }

  // Same raw value receives the same percentile score.
  let cursor=0;
  while(cursor<n){
    let end=cursor+1;
    while(end<n && ranked[end].value===ranked[cursor].value)end++;

    const mid=(cursor+(end-1))/2;
    const score=1-(mid/(n-1));

    for(let k=cursor;k<end;k++){
      scores.set(ranked[k].key,score);
    }

    cursor=end;
  }

  return scores;
}

function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  /*
    TRUE JOINT SORT:
      1) selected period price-change rank
      2) Age rank
      3) MC rank

    All three are active at the same time with equal weight.
    This is intentionally NOT a tie-break chain.
  */

  const priceRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(tokenChangeForPeriod(token),null),
    'desc',
    value=>Number.isFinite(value)
  );

  const ageRanks=buildPercentileRanks(
    out,
    token=>tokenCreatedTimestamp(token),
    tokenAgeDirection==='youngest'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const mcRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(token?.market_cap,null),
    tokenMcDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const scored=out.map((token,index)=>{
    const key=tokenRankKey(token,index);

    // Missing data gets 0 for that criterion rather than a fake favorable rank.
    const price=priceRanks.get(key)??0;
    const age=ageRanks.get(key)??0;
    const mc=mcRanks.get(key)??0;

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

  return scored.map(row=>row.token);
}

function ensureTokenSortControls(){
  const grid=$('#tokensGrid');
  if(!grid)return;

  let wrap=$('#tokenSortWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='tokenSortWrap';
    wrap.className='si-token-sort-wrap';
    grid.before(wrap);
  }

  wrap.innerHTML=`
    <div class="si-token-sort" role="group" aria-label="Token joint sorting">
      <button type="button" data-token-period="m1">1M</button>
      <button type="button" data-token-period="m5">5M</button>
      <button type="button" data-token-period="h1">1H</button>
      <button type="button" data-token-period="h6">6H</button>
      <button type="button" data-token-period="h24">24H</button>
      <button type="button" data-token-age class="is-active">
        Age ${tokenAgeDirection==='youngest'?'↓':'↑'}
      </button>
      <button type="button" data-token-mc class="is-active">
        MC ${tokenMcDirection==='desc'?'↓':'↑'}
      </button>
    </div>`;

  wrap.querySelectorAll('[data-token-period]').forEach(button=>{
    const period=button.dataset.tokenPeriod;
    const active=period===tokenPeriod;

    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');

    button.onclick=()=>{
      tokenPeriod=period;

      try{
        localStorage.setItem('si-token-period',period);
      }catch{}

      renderTokens();
    };
  });

  const ageButton=wrap.querySelector('[data-token-age]');
  if(ageButton){
    ageButton.setAttribute('aria-pressed','true');

    ageButton.onclick=()=>{
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
      tokenMcDirection=tokenMcDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-mc-direction',tokenMcDirection);
      }catch{}

      renderTokens();
    };
  }
}

function renderTokens(){
  ensureTokenSortControls();

  const a=sortedTokenRows(state.tokens);

  $('#tokensGrid').innerHTML=a.map(t=>{
    const raw=tokenChangeForPeriod(t);
    const change=raw==null?null:Number(raw);
    const known=Number.isFinite(change);
    const changeClass=!known?'':change>=0?'pos':'neg';
    const changeText=!known
      ? '—'
      : `${change>=0?'+':''}${change.toFixed(1)}%`;

    return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
      ${siTokenAvatarHtml(t)}
      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${money(t.market_cap||0)}</small>
      </div>
      <strong class="${changeClass}">${changeText}</strong>
    </article>`;
  }).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';

  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;
    openObject('token',{mint:x.dataset.token});
  });

  ensureTokenSortControls();
}
/* SHADOW_TOKENS_JOINT_RANK_V269_END */'''

app = app[:i] + ui + app[j:]

html, n = re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-joint-rank-2.6.9-20260915',
    html,
    count=1
)

if n == 0:
    html, n = re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-joint-rank-2.6.9-20260915\2',
        html,
        count=1
    )

if n != 1:
    raise SystemExit("ERROR: app.js script tag not found")

app_path.write_text(app, encoding="utf-8")
html_path.write_text(html, encoding="utf-8")

print("PATCH: PASS")
print("Fixed v2.6.8: Age/MC were only tie-breakers")
print("Now Price + Age + MC all affect every token rank")
print("Equal weight: 33.3% price rank + 33.3% age rank + 33.3% MC rank")
print("Age arrow and MC arrow change their contribution immediately")
print("Selected time period controls the price-change criterion")
