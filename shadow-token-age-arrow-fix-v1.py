
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

p = Path("public/app.js")
s = p.read_text()

old_helper = """function tokenCreatedTimestamp(token){
  const raw=token?.token_created_at||token?.token_market_created_at||'';
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:0;
}

function tokenAgeLabel(token){
"""
new_helper = """function tokenCreatedTimestamp(token){
  const raw=token?.token_created_at||token?.token_market_created_at||'';
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:0;
}

/* SHADOW_TOKEN_AGE_ARROW_FIX_V392 */
function tokenAgeSortValue(token){
  const created=tokenCreatedTimestamp(token);
  if(!created)return 0;
  return Math.max(0,Date.now()-created);
}
/* SHADOW_TOKEN_AGE_ARROW_FIX_V392_END */

function tokenAgeLabel(token){
"""
if "SHADOW_TOKEN_AGE_ARROW_FIX_V392" not in s:
    s = replace_once(s, old_helper, new_helper, "age sort helper")

old_rank = """  const ageRanks=buildPercentileRanks(
    out,
    token=>tokenCreatedTimestamp(token),
    tokenAgeDirection==='youngest'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );
"""
new_rank = """  const ageRanks=buildPercentileRanks(
    out,
    token=>tokenAgeSortValue(token),
    tokenAgeDirection==='oldest'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );
"""
s = replace_once(s, old_rank, new_rank, "age rank direction")

old_label = "        Age ${tokenAgeDirection==='youngest'?'↓':'↑'}\n"
new_label = "        Age ${tokenAgeDirection==='oldest'?'↓':'↑'}\n"
s = replace_once(s, old_label, new_label, "age arrow label")

p.write_text(s)

print("Patched:")
print("  public/app.js")
print()
print("Age ↓ = older tokens receive the higher Age rank.")
print("Age ↑ = newer tokens receive the higher Age rank.")
