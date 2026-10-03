#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR=".shadow-linked-wallet-search-backup-$STAMP"
FILES=(server.mjs public/app.js tests/smoke.test.mjs)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: $f not found. Run this from the Shadow project workspace root."
    exit 1
  fi
done

mkdir -p "$BACKUP_DIR/public" "$BACKUP_DIR/tests"
cp server.mjs "$BACKUP_DIR/server.mjs"
cp public/app.js "$BACKUP_DIR/public/app.js"
cp tests/smoke.test.mjs "$BACKUP_DIR/tests/smoke.test.mjs"

echo "Backup: $BACKUP_DIR"

restore_on_error() {
  echo "Patch/test failed. Restoring original files..."
  cp "$BACKUP_DIR/server.mjs" server.mjs
  cp "$BACKUP_DIR/public/app.js" public/app.js
  cp "$BACKUP_DIR/tests/smoke.test.mjs" tests/smoke.test.mjs
}
trap restore_on_error ERR

python3 <<'PY'
from pathlib import Path

# ---------- server.mjs ----------
p = Path('server.mjs')
s = p.read_text()

marker = 'SHADOW_LINKED_WALLET_SEARCH_V1_SERVER'
if marker not in s:
    old = '''    const mainWalletStmt=db.prepare(`
      SELECT address
      FROM wallets
      WHERE entity_id=?
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const items=entityRows(db,{solUsd}).map(entity=>{
      const mainWallet=mainWalletStmt.get(entity.id);
      const copy=copyByEntity.get(entity.id);
      return {
        ...entity,
        mainWalletAddress:mainWallet?.address||'',
        copyTradingActive:!!copy?.enabled,
        copyTradingState:copy?.engineState||''
      };
    });'''
    new = '''    /* SHADOW_LINKED_WALLET_SEARCH_V1_SERVER */
    // Keep every tracked wallet on the lightweight entity payload so global
    // search can resolve linked wallets without opening the entity first.
    const entityWalletsStmt=db.prepare(`
      SELECT id,entity_id,address,label,avatar,avatar_source,chain,created_at
      FROM wallets
      WHERE entity_id=?
      ORDER BY created_at ASC
    `);

    const items=entityRows(db,{solUsd}).map(entity=>{
      const wallets=entityWalletsStmt.all(entity.id);
      const mainWallet=wallets[0]||null;
      const copy=copyByEntity.get(entity.id);
      return {
        ...entity,
        mainWalletAddress:mainWallet?.address||'',
        walletAddresses:wallets.map(wallet=>wallet.address).filter(Boolean),
        wallets:wallets.map(wallet=>({
          id:wallet.id,
          entity_id:wallet.entity_id,
          address:wallet.address,
          label:wallet.label||'',
          avatar:wallet.avatar||'',
          avatar_source:wallet.avatar_source||'',
          chain:wallet.chain||'solana',
          created_at:wallet.created_at
        })),
        copyTradingActive:!!copy?.enabled,
        copyTradingState:copy?.engineState||''
      };
    });
    /* SHADOW_LINKED_WALLET_SEARCH_V1_SERVER_END */'''
    if old not in s:
        raise SystemExit('server.mjs target block not found; no files changed')
    s = s.replace(old, new, 1)
    p.write_text(s)

# ---------- public/app.js ----------
p = Path('public/app.js')
s = p.read_text()

helper_marker = 'SHADOW_LINKED_WALLET_SEARCH_V1_APP'
if helper_marker not in s:
    anchor = '/* SHADOW_ENTITIES_CARD_CLEAN_V2423B */\nfunction renderEntities(q=\'\'){' 
    helper = '''/* SHADOW_LINKED_WALLET_SEARCH_V1_APP */
function entityWalletSearchValues(e){
  const addresses=Array.isArray(e?.walletAddresses)?e.walletAddresses:[];
  const wallets=Array.isArray(e?.wallets)?e.wallets:[];
  return [
    e?.mainWalletAddress,
    ...addresses,
    ...wallets.flatMap(wallet=>[wallet?.address,wallet?.label])
  ].filter(Boolean);
}

function entitySearchHaystack(e){
  return [
    e?.name,
    e?.x_handle,
    e?.xHandle,
    e?.notes,
    ...entityWalletSearchValues(e)
  ].filter(Boolean).join(' ').toLowerCase();
}
/* SHADOW_LINKED_WALLET_SEARCH_V1_APP_END */

'''
    if anchor not in s:
        raise SystemExit('public/app.js renderEntities anchor not found')
    s = s.replace(anchor, helper + anchor, 1)

old_filter = '''  const a=ranked.filter(e=>
    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress].join(' ').toLowerCase().includes(query)
  );'''
new_filter = '''  const a=ranked.filter(e=>
    !query||entitySearchHaystack(e).includes(query)
  );'''
if old_filter in s:
    s = s.replace(old_filter, new_filter, 1)
elif new_filter not in s:
    raise SystemExit('public/app.js entity filter target not found')

old_query = "  const query=(q||'').toLowerCase();"
new_query = "  const query=(q||'').trim().toLowerCase();"
# Only normalize the query in renderEntities. The first occurrence after renderEntities is targeted.
render_idx = s.find("function renderEntities(q=''){")
if render_idx < 0:
    raise SystemExit('public/app.js renderEntities function not found')
q_idx = s.find(old_query, render_idx)
if q_idx >= 0 and q_idx < render_idx + 300:
    s = s[:q_idx] + new_query + s[q_idx+len(old_query):]

old_entity_hay = "    const hay=[e.name,e.x_handle,e.xHandle,e.notes].filter(Boolean).join(' ').toLowerCase();"
new_entity_hay = "    const hay=entitySearchHaystack(e);"
if old_entity_hay in s:
    s = s.replace(old_entity_hay, new_entity_hay, 1)
elif new_entity_hay not in s:
    raise SystemExit('public/app.js global entity search target not found')

old_wallet_block = '''  const seenWallets=new Set();
  for(const d of state.details.values()){
    for(const w of d?.wallets||[]){
      const address=String(w.address||'');
      if(!address || seenWallets.has(address))continue;
      seenWallets.add(address);
      const entity=d?.entity||{};
      const hay=[address,w.label,entity.name,entity.x_handle].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(query)){
        rows.push({
          kind:'wallet',
          item:w,
          title:short(address),
          subtitle:entity.x_handle||entity.name||w.label||'Tracked wallet',
          meta:'Wallet'
        });
      }
    }
  }'''

new_wallet_block = '''  const seenWallets=new Set();
  for(const entity of state.entities||[]){
    const detail=state.details.get(entity.id);
    const walletRows=[
      ...(Array.isArray(entity?.wallets)?entity.wallets:[]),
      ...(Array.isArray(detail?.wallets)?detail.wallets:[])
    ];

    for(const rawWallet of walletRows){
      const address=String(rawWallet?.address||'').trim();
      const walletKey=address.toLowerCase();
      if(!address || seenWallets.has(walletKey))continue;
      seenWallets.add(walletKey);

      const wallet={
        ...rawWallet,
        entity_id:rawWallet?.entity_id||entity.id
      };
      const hay=[
        address,
        wallet.label,
        entity.name,
        entity.x_handle,
        entity.xHandle
      ].filter(Boolean).join(' ').toLowerCase();

      if(hay.includes(query)){
        rows.push({
          kind:'wallet',
          item:wallet,
          title:short(address),
          subtitle:entity.x_handle||entity.xHandle||entity.name||wallet.label||'Tracked wallet',
          meta:wallet.label||'Wallet',
          avatar:wallet
        });
      }
    }
  }'''

if old_wallet_block in s:
    s = s.replace(old_wallet_block, new_wallet_block, 1)
elif new_wallet_block not in s:
    raise SystemExit('public/app.js linked-wallet search block not found')

p.write_text(s)

# ---------- tests/smoke.test.mjs ----------
p = Path('tests/smoke.test.mjs')
s = p.read_text()

test_name = "entity list exposes every linked wallet for global search"
if test_name not in s:
    marker = "\ntest('invalid Solana wallet is rejected before monitoring'"
    if marker not in s:
        raise SystemExit('tests/smoke.test.mjs insertion marker not found')
    test = r'''
test('entity list exposes every linked wallet for global search',async()=>withServer(async base=>{
  const cookie=await registerOwner(base);
  let r=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'Multi Wallet Entity',xHandle:'@multiwallet'})});
  assert.equal(r.status,201); const entity=await r.json();

  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET,label:'Main wallet'})});
  assert.equal(r.status,201); const main=await r.json();

  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:MINT,label:'Linked wallet'})});
  assert.equal(r.status,201); const linked=await r.json();

  const entities=await fetch(base+'/api/entities').then(x=>x.json());
  const row=entities.items.find(x=>x.id===entity.id);
  assert.ok(row);
  assert.equal(row.mainWalletAddress,WALLET);
  assert.deepEqual(row.walletAddresses,[WALLET,MINT]);
  assert.equal(row.wallets.length,2);
  assert.equal(row.wallets[0].id,main.id);
  assert.equal(row.wallets[1].id,linked.id);
  assert.equal(row.wallets[1].label,'Linked wallet');
}));
'''
    s = s.replace(marker, '\n' + test + marker, 1)
    p.write_text(s)

print('Linked-wallet search patch applied.')
PY

echo "Checking diff..."
git diff --check

echo "Running tests..."
npm test

# From here on, keep the valid code even if Git credentials/push fail.
trap - ERR

echo "Tests passed. Preparing Git commit..."
git add server.mjs public/app.js tests/smoke.test.mjs

if git diff --cached --quiet; then
  echo "No new changes to commit (patch may already be installed)."
else
  git commit -m "Fix search across all linked entity wallets"
fi

echo "Pushing current HEAD to origin/main..."
git push origin HEAD:main

echo
echo "DONE. No server restart was performed."
echo "Backup: $BACKUP_DIR"
echo "Restart manually from the Replit console when you are ready, then hard-refresh Safari."
