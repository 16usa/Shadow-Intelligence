
from pathlib import Path
import re

app_path=Path("public/app.js")
html_path=Path("public/index.html")

if not app_path.exists() or not html_path.exists():
    raise SystemExit("ERROR: public/app.js or public/index.html not found")

app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

marker_pairs=[
    ("/* SHADOW_TOKENS_TIME_AGE_MC_SORT_V267_START */","/* SHADOW_TOKENS_TIME_AGE_MC_SORT_V267_END */"),
    ("/* SHADOW_TOKENS_TIME_MC_SORT_V266_START */","/* SHADOW_TOKENS_TIME_MC_SORT_V266_END */"),
    ("/* SHADOW_TOKENS_REAL_AGE_UI_V264_START */","/* SHADOW_TOKENS_REAL_AGE_UI_V264_END */"),
]

found=None
for start,end in marker_pairs:
    i=app.find(start)
    j=app.find(end,i) if i>=0 else -1
    if i>=0 and j>=0:
        found=(i,j+len(end))
        break

if not found:
    raise SystemExit("ERROR: compatible Tokens sorting block not found")

i,j=found

ui=r'''/* SHADOW_TOKENS_JOINT_SORT_V268_START */
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

function tokenSortNumber(value,fallback=-Infinity){
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

function compareAge(a,b){
  const at=tokenCreatedTimestamp(a);
  const bt=tokenCreatedTimestamp(b);

  // Unknown age always goes to the bottom.
  if(!at && !bt)return 0;
  if(!at)return 1;
  if(!bt)return -1;

  // Newer timestamp = younger token.
  return tokenAgeDirection==='youngest'
    ? bt-at
    : at-bt;
}

function compareMc(a,b){
  const amc=tokenSortNumber(a?.market_cap,0);
  const bmc=tokenSortNumber(b?.market_cap,0);

  return tokenMcDirection==='desc'
    ? bmc-amc
    : amc-bmc;
}

function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  /*
    JOINT SORT — all three criteria work at the same time:
    1) selected price-change period (primary)
    2) token age direction (secondary)
    3) market cap direction (tertiary)

    We quantize the percentage to 0.1% so Age/MC can actually participate
    when price moves are effectively equal at the precision shown in UI.
  */
  return out.sort((a,b)=>{
    const ap=tokenSortNumber(tokenChangeForPeriod(a));
    const bp=tokenSortNumber(tokenChangeForPeriod(b));

    const aq=Number.isFinite(ap)?Math.round(ap*10):Number.NEGATIVE_INFINITY;
    const bq=Number.isFinite(bp)?Math.round(bp*10):Number.NEGATIVE_INFINITY;

    if(aq!==bq)return bq-aq;

    const age=compareAge(a,b);
    if(age!==0)return age;

    const mc=compareMc(a,b);
    if(mc!==0)return mc;

    return tokenSortNumber(bp)-tokenSortNumber(ap);
  });
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
    <div class="si-token-sort" role="group" aria-label="Token multi-sort">
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
/* SHADOW_TOKENS_JOINT_SORT_V268_END */'''

app=app[:i]+ui+app[j:]

html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-joint-sort-2.6.8-20260915',
    html,
    count=1
)

if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-joint-sort-2.6.8-20260915\2',
        html,
        count=1
    )

if n!=1:
    raise SystemExit("ERROR: app.js script tag not found")

app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("All three criteria now work together")
print("Primary: selected time-period price change")
print("Secondary: Age direction")
print("Tertiary: MC direction")
print("Age and MC directions stay active while time period changes")
print("Age/MC remain visible on every card")
