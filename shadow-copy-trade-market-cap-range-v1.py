
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

# 1) Database schema + migration
p = Path("src/db.mjs")
s = p.read_text()

old_schema = """      slippage_bps INTEGER NOT NULL DEFAULT 500,
      copy_buys INTEGER NOT NULL DEFAULT 1,
"""
new_schema = """      slippage_bps INTEGER NOT NULL DEFAULT 500,
      min_market_cap_usd REAL NOT NULL DEFAULT 0,
      max_market_cap_usd REAL NOT NULL DEFAULT 0,
      copy_buys INTEGER NOT NULL DEFAULT 1,
"""
s = replace_once(s, old_schema, new_schema, "copy_subscriptions market cap schema")

migration_marker = """  addColumn(db,'entities',"profile_url TEXT DEFAULT ''");
  /* SHADOW_PROFILE_SOURCE_V270_DB_END */
"""
migration_block = """  addColumn(db,'entities',"profile_url TEXT DEFAULT ''");
  /* SHADOW_PROFILE_SOURCE_V270_DB_END */
  /* SHADOW_COPY_MC_RANGE_V360_DB */
  addColumn(db,'copy_subscriptions',"min_market_cap_usd REAL NOT NULL DEFAULT 0");
  addColumn(db,'copy_subscriptions',"max_market_cap_usd REAL NOT NULL DEFAULT 0");
  /* SHADOW_COPY_MC_RANGE_V360_DB_END */
"""
s = replace_once(s, migration_marker, migration_block, "copy market cap migration")
p.write_text(s)

# 2) Server API persistence + validation + response mapping
p = Path("server.mjs")
s = p.read_text()

old_mapping = """    maxDailySol:row.max_daily_sol,
    slippageBps:row.slippage_bps,
    sellPercent:row.sell_percent,
"""
new_mapping = """    maxDailySol:row.max_daily_sol,
    slippageBps:row.slippage_bps,
    minMarketCapUsd:Number(row.min_market_cap_usd||0),
    maxMarketCapUsd:Number(row.max_market_cap_usd||0),
    sellPercent:row.sell_percent,
"""
s = replace_once(s, old_mapping, new_mapping, "copy subscription response mapping")

old_parse = """    const slippageBps=Math.round(numBetween(b.slippageBps,10,3000,500));
    const copyBuys=b.copyBuys!==false?1:0;
"""
new_parse = """    const slippageBps=Math.round(numBetween(b.slippageBps,10,3000,500));
    const minMarketCapUsd=numBetween(b.minMarketCapUsd,0,1_000_000_000_000,0);
    const rawMaxMarketCapUsd=Number(b.maxMarketCapUsd);
    const maxMarketCapUsd=Number.isFinite(rawMaxMarketCapUsd)&&rawMaxMarketCapUsd>0
      ? Math.min(1_000_000_000_000,rawMaxMarketCapUsd)
      : 0;
    if(maxMarketCapUsd>0 && maxMarketCapUsd<minMarketCapUsd){
      return json(res,400,{error:'Maximum market cap must be greater than or equal to minimum market cap'});
    }
    const copyBuys=b.copyBuys!==false?1:0;
"""
s = replace_once(s, old_parse, new_parse, "copy market cap validation")

old_update = """        UPDATE copy_subscriptions SET
          user_wallet_id=?,amount_sol=?,max_position_sol=?,max_daily_sol=?,
          slippage_bps=?,copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?
        WHERE id=? AND user_id=?
      `).run(wallet.id,amountSol,maxPositionSol,maxDailySol,slippageBps,copyBuys,copySells,sellPercent,at,subId,user.id);
"""
new_update = """        UPDATE copy_subscriptions SET
          user_wallet_id=?,amount_sol=?,max_position_sol=?,max_daily_sol=?,
          slippage_bps=?,min_market_cap_usd=?,max_market_cap_usd=?,
          copy_buys=?,copy_sells=?,sell_percent=?,updated_at=?
        WHERE id=? AND user_id=?
      `).run(
        wallet.id,amountSol,maxPositionSol,maxDailySol,
        slippageBps,minMarketCapUsd,maxMarketCapUsd,
        copyBuys,copySells,sellPercent,at,subId,user.id
      );
"""
s = replace_once(s, old_update, new_update, "copy market cap update SQL")

old_insert = """        INSERT INTO copy_subscriptions
          (id,user_id,user_wallet_id,entity_id,enabled,amount_sol,max_position_sol,max_daily_sol,
           slippage_bps,copy_buys,copy_sells,sell_percent,engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,'draft','',?,?)
      `).run(subId,user.id,wallet.id,entity.id,amountSol,maxPositionSol,maxDailySol,slippageBps,copyBuys,copySells,sellPercent,at,at);
"""
new_insert = """        INSERT INTO copy_subscriptions
          (id,user_id,user_wallet_id,entity_id,enabled,amount_sol,max_position_sol,max_daily_sol,
           slippage_bps,min_market_cap_usd,max_market_cap_usd,copy_buys,copy_sells,sell_percent,
           engine_state,last_error,created_at,updated_at)
        VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,'draft','',?,?)
      `).run(
        subId,user.id,wallet.id,entity.id,
        amountSol,maxPositionSol,maxDailySol,slippageBps,
        minMarketCapUsd,maxMarketCapUsd,copyBuys,copySells,sellPercent,
        at,at
      );
"""
s = replace_once(s, old_insert, new_insert, "copy market cap insert SQL")
p.write_text(s)

# 3) Copy-trading UI
p = Path("public/app.js")
s = p.read_text()

old_fields = """      <label>Max slippage (bps)
        <input name="slippageBps" type="number" min="10" max="3000" step="10" value="${esc(sub.slippageBps??500)}">
      </label>
      <label class="si-copy-check"><span>Copy buys</span><input name="copyBuys" type="checkbox" ${sub.copyBuys===false?'':'checked'}></label>
"""
new_fields = """      <label>Max slippage (bps)
        <input name="slippageBps" type="number" min="10" max="3000" step="10" value="${esc(sub.slippageBps??500)}">
      </label>
      <label>Min market cap ($)
        <input name="minMarketCapUsd" type="number" min="0" max="1000000000000" step="1000" placeholder="No minimum" value="${Number(sub.minMarketCapUsd||0)>0?esc(sub.minMarketCapUsd):''}">
      </label>
      <label>Max market cap ($)
        <input name="maxMarketCapUsd" type="number" min="0" max="1000000000000" step="1000" placeholder="No maximum" value="${Number(sub.maxMarketCapUsd||0)>0?esc(sub.maxMarketCapUsd):''}">
      </label>
      <label class="si-copy-check"><span>Copy buys</span><input name="copyBuys" type="checkbox" ${sub.copyBuys===false?'':'checked'}></label>
"""
s = replace_once(s, old_fields, new_fields, "copy modal market cap fields")

old_save_body = """      maxDailySol:Number(fd.get('maxDailySol')),
      slippageBps:Number(fd.get('slippageBps')),
      copyBuys:form.elements.copyBuys.checked,
"""
new_save_body = """      maxDailySol:Number(fd.get('maxDailySol')),
      slippageBps:Number(fd.get('slippageBps')),
      minMarketCapUsd:Number(fd.get('minMarketCapUsd')||0),
      maxMarketCapUsd:Number(fd.get('maxMarketCapUsd')||0),
      copyBuys:form.elements.copyBuys.checked,
"""
s = replace_once(s, old_save_body, new_save_body, "copy save market cap fields")

old_save_transition = """    save.disabled=true;
    save.textContent='Connecting…';
"""
new_save_transition = """    if(
      body.maxMarketCapUsd>0 &&
      body.maxMarketCapUsd<body.minMarketCapUsd
    ){
      toast('Max market cap must be greater than or equal to Min market cap');
      form.elements.maxMarketCapUsd?.focus();
      return;
    }

    save.disabled=true;
    save.textContent='Connecting…';
"""
s = replace_once(s, old_save_transition, new_save_transition, "copy client market cap validation")

old_stop_body = """          maxDailySol:Number(form.elements.maxDailySol.value),
          slippageBps:Number(form.elements.slippageBps.value),
          copyBuys:form.elements.copyBuys.checked,
"""
new_stop_body = """          maxDailySol:Number(form.elements.maxDailySol.value),
          slippageBps:Number(form.elements.slippageBps.value),
          minMarketCapUsd:Number(form.elements.minMarketCapUsd.value||0),
          maxMarketCapUsd:Number(form.elements.maxMarketCapUsd.value||0),
          copyBuys:form.elements.copyBuys.checked,
"""
s = replace_once(s, old_stop_body, new_stop_body, "copy stop market cap fields")
p.write_text(s)

# 4) Engine adapter contract
p = Path("src/adapters/copy-trading.mjs")
s = p.read_text()

import_marker = "import { isSafeHttpUrl } from '../utils.mjs';\n"
if "function normalizeCopySubscription" not in s:
    helper = """
function normalizeCopySubscription(subscription={}) {
  const min=Math.max(0,Number(
    subscription.minMarketCapUsd ?? subscription.min_market_cap_usd ?? 0
  )||0);
  const rawMax=Number(
    subscription.maxMarketCapUsd ?? subscription.max_market_cap_usd ?? 0
  );
  const max=Number.isFinite(rawMax)&&rawMax>0?rawMax:0;
  const enabled=min>0||max>0;

  return {
    ...subscription,
    minMarketCapUsd:min,
    maxMarketCapUsd:max,
    buyFilters:{
      ...(subscription.buyFilters||{}),
      marketCapUsd:{
        enabled,
        min,
        max,
        appliesTo:'buy',
        marketCapSource:'current_at_execution',
        unknownMarketCap:'skip'
      }
    }
  };
}

"""
    s = s.replace(import_marker, import_marker + helper, 1)

old_fn_start = """export async function syncCopySubscription(subscription, entityWallets, action='upsert') {
  const endpoint=process.env.COPY_ENGINE_URL;
"""
new_fn_start = """export async function syncCopySubscription(subscription, entityWallets, action='upsert') {
  const normalizedSubscription=normalizeCopySubscription(subscription);
  const endpoint=process.env.COPY_ENGINE_URL;
"""
s = replace_once(s, old_fn_start, new_fn_start, "normalize copy subscription")

old_internal = """    const data=await internal({action,subscription,entityWallets});
"""
new_internal = """    const data=await internal({action,subscription:normalizedSubscription,entityWallets});
"""
s = replace_once(s, old_internal, new_internal, "internal engine normalized subscription")

old_external = """      action,
      subscription,
      entityWallets:entityWallets.map(w=>({
"""
new_external = """      action,
      subscription:normalizedSubscription,
      marketCapPolicy:normalizedSubscription.buyFilters.marketCapUsd,
      entityWallets:entityWallets.map(w=>({
"""
s = replace_once(s, old_external, new_external, "external engine market cap policy")
p.write_text(s)

# 5) Internal delegated-engine metadata
p = Path("src/internal-copy-engine.mjs")
s = p.read_text()

public_marker = """function publicSession(row){
  if(!row)return null;
  return {
    address:row.vault_address,
    kind:'noncustodial_delegated_vault',
    policyAddress:row.policy_address,
    sessionPublicKey:row.session_public_key,
    programId:row.program_id,
    authorizedAt:row.authorized_at||'',
    revokedAt:row.revoked_at||'',
  };
}
"""
if "function buyMarketCapFilter" not in s:
    helper = public_marker + """
function buyMarketCapFilter(subscription={}) {
  const min=Math.max(0,Number(
    subscription.min_market_cap_usd ?? subscription.minMarketCapUsd ?? 0
  )||0);
  const rawMax=Number(
    subscription.max_market_cap_usd ?? subscription.maxMarketCapUsd ?? 0
  );
  const max=Number.isFinite(rawMax)&&rawMax>0?rawMax:0;
  return {
    enabled:min>0||max>0,
    minMarketCapUsd:min,
    maxMarketCapUsd:max,
    appliesTo:'buy',
    marketCapSource:'current_at_execution',
    unknownMarketCap:'skip',
    sellsBypass:true
  };
}
"""
    s = replace_once(s, public_marker, helper, "internal buy market cap helper")

old_snapshot_tail = """      environment:environmentStatus(),
      executionReady:false,
"""
new_snapshot_tail = """      environment:environmentStatus(),
      buyMarketCapFilter:buyMarketCapFilter(canonical),
      executionReady:false,
"""
s = replace_once(s, old_snapshot_tail, new_snapshot_tail, "internal engine snapshot market cap policy")

old_auth = """      maxDailySol:Number(sub.max_daily_sol||0),slippageBps:Number(sub.slippage_bps||0),copyBuys:!!sub.copy_buys,
      copySells:!!sub.copy_sells,sellPercent:Number(sub.sell_percent||100),expiresAt:row.auth_token_expires_at,
"""
new_auth = """      maxDailySol:Number(sub.max_daily_sol||0),slippageBps:Number(sub.slippage_bps||0),
      minMarketCapUsd:Number(sub.min_market_cap_usd||0),maxMarketCapUsd:Number(sub.max_market_cap_usd||0),
      buyMarketCapFilter:buyMarketCapFilter(sub),copyBuys:!!sub.copy_buys,
      copySells:!!sub.copy_sells,sellPercent:Number(sub.sell_percent||100),expiresAt:row.auth_token_expires_at,
"""
s = replace_once(s, old_auth, new_auth, "authorization details market cap policy")
p.write_text(s)

print("Patched:")
print("  src/db.mjs")
print("  server.mjs")
print("  public/app.js")
print("  src/adapters/copy-trading.mjs")
print("  src/internal-copy-engine.mjs")
