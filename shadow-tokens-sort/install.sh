#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/workspace}"
cd "$ROOT"

APP="public/app.js"
HTML="public/index.html"
CSS="public/si-token-sort.css"

for f in "$APP" "$HTML"; do
  [[ -f "$f" ]] || { echo "ERROR: missing required file: $f"; exit 1; }
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP=".shadow-backups/tokens-sort-v2.5.8-${STAMP}"
mkdir -p "$BACKUP/public"

cp "$APP" "$BACKUP/public/app.js"
cp "$HTML" "$BACKUP/public/index.html"

if [[ -f "$CSS" ]]; then
  cp "$CSS" "$BACKUP/public/si-token-sort.css"
  touch "$BACKUP/.had-css"
fi

printf '%s\n' "$BACKUP" > .shadow-last-tokens-sort-backup

cp "$(dirname "$0")/si-token-sort.css" "$CSS"

python3 - <<'PY'
from pathlib import Path
import re

app_path=Path("public/app.js")
html_path=Path("public/index.html")

app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

start=app.find("function renderTokens(){")
end=app.find("/* SHADOW_LIVE_AVATAR_STABILITY_V2410_START */",start)

if start<0 or end<0:
    raise SystemExit("ERROR: renderTokens block not found")

new_block=r'''/* SHADOW_TOKENS_SORT_V258_START */
let tokenSortMode=(()=>{
  try{
    const saved=localStorage.getItem('si-token-sort');
    return ['top1h','newest','mc'].includes(saved)?saved:'top1h';
  }catch{
    return 'top1h';
  }
})();

function tokenSortTimestamp(token){
  const primary=Date.parse(token?.created_at||token?.createdAt||'');
  if(Number.isFinite(primary))return primary;
  const fallback=Date.parse(token?.last_market_at||token?.lastMarketAt||'');
  return Number.isFinite(fallback)?fallback:0;
}

function tokenSortNumber(value,fallback=-Infinity){
  if(value==null||value==='')return fallback;
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  if(tokenSortMode==='newest'){
    return out.sort((a,b)=>
      tokenSortTimestamp(b)-tokenSortTimestamp(a)
      || tokenSortNumber(b.price_change)-tokenSortNumber(a.price_change)
    );
  }

  if(tokenSortMode==='mc'){
    return out.sort((a,b)=>
      tokenSortNumber(b.market_cap,0)-tokenSortNumber(a.market_cap,0)
      || tokenSortNumber(b.price_change)-tokenSortNumber(a.price_change)
    );
  }

  return out.sort((a,b)=>
    tokenSortNumber(b.price_change)-tokenSortNumber(a.price_change)
    || tokenSortNumber(b.market_cap,0)-tokenSortNumber(a.market_cap,0)
  );
}

function ensureTokenSortControls(){
  const page=$('#page-tokens');
  const grid=$('#tokensGrid');
  if(!page||!grid)return;

  let wrap=$('#tokenSortWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='tokenSortWrap';
    wrap.className='si-token-sort-wrap';
    wrap.innerHTML=`
      <div class="si-token-sort" role="group" aria-label="Sort tokens">
        <button type="button" data-token-sort="top1h">Top 1H</button>
        <button type="button" data-token-sort="newest">Newest</button>
        <button type="button" data-token-sort="mc">MC</button>
      </div>`;
    grid.before(wrap);
  }

  wrap.querySelectorAll('[data-token-sort]').forEach(button=>{
    const mode=button.dataset.tokenSort;
    const active=mode===tokenSortMode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');

    button.onclick=()=>{
      tokenSortMode=mode;
      try{localStorage.setItem('si-token-sort',mode)}catch{}
      renderTokens();
    };
  });
}

function renderTokens(){
  ensureTokenSortControls();

  const a=sortedTokenRows(state.tokens);

  $('#tokensGrid').innerHTML=a.map(t=>{
    const raw=t.price_change;
    const change=raw==null?null:Number(raw);
    const known=Number.isFinite(change);
    const changeClass=!known?'':change>=0?'pos':'neg';
    const changeText=!known
      ? '1H —'
      : `1H ${change>=0?'+':''}${change.toFixed(1)}%`;

    return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
      ${siTokenAvatarHtml(t)}
      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)}</small>
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
/* SHADOW_TOKENS_SORT_V258_END */
'''

app=app[:start]+new_block+app[end:]

css_tag='<link rel="stylesheet" href="/si-token-sort.css?v=2.5.8-20260915"/>'
if "si-token-sort.css" not in html:
    if "</head>" not in html:
        raise SystemExit("ERROR: </head> not found")
    html=html.replace("</head>",css_tag+"\n</head>",1)
else:
    html,_=re.subn(
        r'(/si-token-sort\.css\?v=)[^"\']+',
        r'\g<1>2.5.8-20260915',
        html,
        count=1
    )

html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-sort-2.5.8-20260915',
    html,
    count=1
)
if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-sort-2.5.8-20260915\2',
        html,
        count=1
    )
if n!=1:
    raise SystemExit("ERROR: app.js script tag not found")

app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Added Tokens sort control: Top 1H | Newest | MC")
print("Default: Top 1H")
print("Top 1H: highest strict 1H growth first")
print("Newest: newest observed token first")
print("MC: highest market cap first")
print("No A-Z option")
PY

node --check public/app.js

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --check
fi

echo
echo "Shadow Tokens Sort v2.5.8: INSTALLED"
echo "Backup: $BACKUP"
echo "No server restart required."
echo "Refresh Safari."
