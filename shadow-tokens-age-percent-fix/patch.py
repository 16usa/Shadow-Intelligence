
from pathlib import Path
import re

server_path=Path("server.mjs")
app_path=Path("public/app.js")
html_path=Path("public/index.html")

server=server_path.read_text(encoding="utf-8")
app=app_path.read_text(encoding="utf-8")
html=html_path.read_text(encoding="utf-8")

# --- 1M calculation: only use a genuinely recent snapshot around one minute ago.
old_func = """function oneMinuteChange(db,tokenId,currentPrice,nowMs){
  const cutoff=new Date(nowMs-60*1000).toISOString();
  const row=db.prepare(`
    SELECT price_usd AS price
    FROM market_snapshots
    WHERE token_id=? AND created_at<=? AND price_usd>0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tokenId,cutoff);
  return row?pctFromPrices(currentPrice,row.price):null;
}"""

new_func = """function oneMinuteChange(db,tokenId,currentPrice,nowMs){
  const cutoff=new Date(nowMs-60*1000).toISOString();
  const floor=new Date(nowMs-180*1000).toISOString();
  const row=db.prepare(`
    SELECT price_usd AS price
    FROM market_snapshots
    WHERE token_id=?
      AND created_at>=?
      AND created_at<=?
      AND price_usd>0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tokenId,floor,cutoff);
  return row?pctFromPrices(currentPrice,row.price):null;
}"""

if old_func not in server:
    raise SystemExit("ERROR: v2.6.1 oneMinuteChange() block not found")
server=server.replace(old_func,new_func,1)

# --- Add compact age formatter.
age_anchor = """function tokenAgeTimestamp(token){
  const value=Date.parse(token?.token_market_created_at||'');
  return Number.isFinite(value)?value:0;
}"""

age_replacement = """function tokenAgeTimestamp(token){
  const value=Date.parse(token?.token_market_created_at||'');
  return Number.isFinite(value)?value:0;
}

function tokenAgeLabel(token){
  const created=tokenAgeTimestamp(token);
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
}"""

if age_anchor not in app:
    raise SystemExit("ERROR: v2.6.1 tokenAgeTimestamp() block not found")
app=app.replace(age_anchor,age_replacement,1)

# --- Show token age on every card beside MC.
old_meta = """<small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)}</small>"""
new_meta = """<small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${money(t.market_cap||0)}</small>"""

if old_meta not in app:
    raise SystemExit("ERROR: token card metadata line not found")
app=app.replace(old_meta,new_meta,1)

# --- Keep Tokens market windows live while the Tokens page is open.
refresh_marker="/* SHADOW_TOKENS_LIVE_PERIOD_REFRESH_V262 */"
if refresh_marker not in app:
    ui_end="/* SHADOW_TOKENS_PERIOD_AGE_SORT_V261_END */"
    pos=app.find(ui_end)
    if pos<0:
        raise SystemExit("ERROR: v2.6.1 Tokens UI marker not found")
    pos += len(ui_end)

    refresh_code = r"""
/* SHADOW_TOKENS_LIVE_PERIOD_REFRESH_V262 */
let tokenPeriodRefreshBusy=false;

async function refreshTokenPeriodData(){
  const page=$('#page-tokens');
  if(document.hidden || !page?.classList.contains('active-page') || tokenPeriodRefreshBusy)return;

  tokenPeriodRefreshBusy=true;
  try{
    const data=await api('/api/tokens');
    if(Array.isArray(data?.items)){
      state.tokens=data.items;
      renderTokens();
    }
  }catch(error){
    console.debug('Token period refresh unavailable',error);
  }finally{
    tokenPeriodRefreshBusy=false;
  }
}

setInterval(refreshTokenPeriodData,65000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refreshTokenPeriodData();
});
/* SHADOW_TOKENS_LIVE_PERIOD_REFRESH_V262_END */
"""
    app=app[:pos]+refresh_code+app[pos:]

# --- Cache-bust app.js.
html,n=re.subn(
    r'(/app\.js\?v=)[^"\']+',
    r'\g<1>tokens-age-percent-fix-2.6.2-20260915',
    html,
    count=1
)
if n==0:
    html,n=re.subn(
        r'(<script[^>]+src=["\']/app\.js)(["\'])',
        r'\1?v=tokens-age-percent-fix-2.6.2-20260915\2',
        html,
        count=1
    )
if n!=1:
    raise SystemExit("ERROR: app.js script tag not found")

server_path.write_text(server,encoding="utf-8")
app_path.write_text(app,encoding="utf-8")
html_path.write_text(html,encoding="utf-8")

print("PATCH: PASS")
print("Added Age to every token card")
print("Age format: <1m / 12m / 3h / 2d / 4mo / 1y")
print("1M percentages now auto-refresh every 65 seconds while Tokens is open")
print("1M calculation only uses a recent snapshot, never an old stale price")
print("5M / 1H / 6H / 24H behavior is unchanged")
