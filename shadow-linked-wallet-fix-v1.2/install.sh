#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
SERVER="$ROOT/server.mjs"
APP="$ROOT/public/app.js"
TEST="$ROOT/tests/smoke.test.mjs"

for f in "$SERVER" "$APP" "$TEST"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: required file not found: $f"
    echo "Run this installer from the existing Shadow project workspace root."
    exit 1
  fi
done

BACKUP="$(mktemp -d)"
mkdir -p "$BACKUP/public" "$BACKUP/tests"
cp "$SERVER" "$BACKUP/server.mjs"
cp "$APP" "$BACKUP/public/app.js"
cp "$TEST" "$BACKUP/tests/smoke.test.mjs"

restore_originals() {
  cp "$BACKUP/server.mjs" "$SERVER"
  cp "$BACKUP/public/app.js" "$APP"
  cp "$BACKUP/tests/smoke.test.mjs" "$TEST"
}

on_exit() {
  rc=$?
  if [[ $rc -ne 0 ]]; then
    echo
    echo "Patch/test failed. Restoring original files..."
    restore_originals
  fi
  rm -rf "$BACKUP"
  exit $rc
}
trap on_exit EXIT

python3 <<'PY'
from pathlib import Path

server_path = Path('server.mjs')
app_path = Path('public/app.js')
test_path = Path('tests/smoke.test.mjs')

server = server_path.read_text()
app = app_path.read_text()
test = test_path.read_text()

if 'SHADOW_LINKED_WALLET_SEARCH_V12' in server and 'SHADOW_LINKED_WALLET_SEARCH_V12' in app:
    print('v1.2 code markers already present; leaving source unchanged and running validation.')
else:
    def replace_once(text, old, new, label):
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'ERROR: {label}: expected exactly 1 match, found {count}. No files were written.')
        return text.replace(old, new, 1)

    server = replace_once(
        server,
        "async function api(req, res, db, url, live) {",
        "async function api(req, res, db, url, live, { allowBackgroundSync = true } = {}) {",
        'server api signature'
    )

    old_entities = """    const mainWalletStmt=db.prepare(`\n      SELECT address\n      FROM wallets\n      WHERE entity_id=?\n      ORDER BY created_at ASC\n      LIMIT 1\n    `);\n\n    const items=entityRows(db,{solUsd}).map(entity=>{\n      const mainWallet=mainWalletStmt.get(entity.id);\n      const copy=copyByEntity.get(entity.id);\n      return {\n        ...entity,\n        mainWalletAddress:mainWallet?.address||'',\n        copyTradingActive:!!copy?.enabled,\n        copyTradingState:copy?.engineState||''\n      };\n    });"""
    new_entities = """    /* SHADOW_LINKED_WALLET_SEARCH_V12 */\n    const walletsByEntity=new Map();\n    for(const wallet of db.prepare(`\n      SELECT *\n      FROM wallets\n      ORDER BY created_at ASC\n    `).all()){\n      const entityId=String(wallet.entity_id||'');\n      if(!walletsByEntity.has(entityId))walletsByEntity.set(entityId,[]);\n      walletsByEntity.get(entityId).push(wallet);\n    }\n\n    const items=entityRows(db,{solUsd}).map(entity=>{\n      const linkedWallets=walletsByEntity.get(String(entity.id))||[];\n      const copy=copyByEntity.get(entity.id);\n      return {\n        ...entity,\n        mainWalletAddress:linkedWallets[0]?.address||'',\n        linkedWallets,\n        copyTradingActive:!!copy?.enabled,\n        copyTradingState:copy?.engineState||''\n      };\n    });\n    /* SHADOW_LINKED_WALLET_SEARCH_V12_END */"""
    server = replace_once(server, old_entities, new_entities, 'entity list wallet payload')

    old_sync = "    setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();"
    new_sync = """    // Short-lived test servers use autoMonitor=false. Do not detach DB work that\n    // can outlive server.close(); the real app still performs the initial sync.\n    if(allowBackgroundSync){\n      setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();\n    }"""
    server = replace_once(server, old_sync, new_sync, 'background wallet sync guard')

    server = replace_once(
        server,
        "if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);",
        "if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live,{allowBackgroundSync:autoMonitor}); else serveStatic(req,res,url);",
        'createServer api invocation'
    )

    old_filter = """  const a=ranked.filter(e=>\n    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress].join(' ').toLowerCase().includes(query)\n  );"""
    new_filter = """  /* SHADOW_LINKED_WALLET_SEARCH_V12 */\n  const a=ranked.filter(e=>{\n    const walletTerms=(Array.isArray(e.linkedWallets)?e.linkedWallets:[])\n      .flatMap(w=>[w?.address,w?.label])\n      .filter(Boolean);\n    return !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress,...walletTerms]\n      .filter(Boolean)\n      .join(' ')\n      .toLowerCase()\n      .includes(query);\n  });\n  /* SHADOW_LINKED_WALLET_SEARCH_V12_END */"""
    app = replace_once(app, old_filter, new_filter, 'entities-page wallet search')

    old_search = """  const seenWallets=new Set();\n  for(const d of state.details.values()){\n    for(const w of d?.wallets||[]){\n      const address=String(w.address||'');\n      if(!address || seenWallets.has(address))continue;\n      seenWallets.add(address);\n      const entity=d?.entity||{};\n      const hay=[address,w.label,entity.name,entity.x_handle].filter(Boolean).join(' ').toLowerCase();\n      if(hay.includes(query)){\n        rows.push({\n          kind:'wallet',\n          item:w,\n          title:short(address),\n          subtitle:entity.x_handle||entity.name||w.label||'Tracked wallet',\n          meta:'Wallet'\n        });\n      }\n    }\n  }"""
    new_search = """  /* SHADOW_LINKED_WALLET_SEARCH_V12 */\n  const seenWallets=new Set();\n  const maybeAddWallet=(w,entity={})=>{\n    const address=String(w?.address||'');\n    if(!address || seenWallets.has(address))return;\n    seenWallets.add(address);\n\n    const item={\n      ...w,\n      entity_id:w?.entity_id||entity?.id||''\n    };\n    const hay=[address,w?.label,entity?.name,entity?.x_handle,entity?.xHandle]\n      .filter(Boolean)\n      .join(' ')\n      .toLowerCase();\n\n    if(hay.includes(query)){\n      rows.push({\n        kind:'wallet',\n        item,\n        title:short(address),\n        subtitle:entity?.x_handle||entity?.xHandle||entity?.name||w?.label||'Tracked wallet',\n        meta:'Wallet'\n      });\n    }\n  };\n\n  // Search every linked wallet immediately from /api/entities. This no longer\n  // depends on the user opening an entity first and populating state.details.\n  for(const entity of state.entities||[]){\n    for(const w of entity?.linkedWallets||[])maybeAddWallet(w,entity);\n  }\n\n  // Keep hydrated detail wallets as a fallback, deduplicated by address.\n  for(const d of state.details.values()){\n    const entity=d?.entity||{};\n    for(const w of d?.wallets||[])maybeAddWallet(w,entity);\n  }\n  /* SHADOW_LINKED_WALLET_SEARCH_V12_END */"""
    app = replace_once(app, old_search, new_search, 'global linked-wallet search')

    if 'SHADOW_LINKED_WALLET_SEARCH_V12_TEST' not in test:
        test = replace_once(
            test,
            "const WALLET='5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij';",
            "const WALLET='5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij';\nconst WALLET2='So11111111111111111111111111111111111111112';",
            'test second wallet constant'
        )

        anchor = "test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));"
        addition = """test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));\n\n/* SHADOW_LINKED_WALLET_SEARCH_V12_TEST */\ntest('entity list exposes every linked wallet for global search without detached DB work',async()=>withServer(async base=>{\n  const cookie=await registerOwner(base);\n  let r=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'Multi Wallet Search'})});\n  assert.equal(r.status,201);\n  const entity=await r.json();\n\n  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET,label:'Main wallet'})});\n  assert.equal(r.status,201);\n  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET2,label:'Linked wallet'})});\n  assert.equal(r.status,201);\n\n  const list=await fetch(base+'/api/entities').then(x=>x.json());\n  const row=list.items.find(x=>x.id===entity.id);\n  assert.ok(row);\n  assert.equal(row.mainWalletAddress,WALLET);\n  assert.deepEqual(row.linkedWallets.map(x=>x.address),[WALLET,WALLET2]);\n  assert.equal(row.linkedWallets[1].label,'Linked wallet');\n}));\n/* SHADOW_LINKED_WALLET_SEARCH_V12_TEST_END */"""
        test = replace_once(test, anchor, addition, 'linked-wallet smoke test')

    server_path.write_text(server)
    app_path.write_text(app)
    test_path.write_text(test)
    print('Applied Shadow linked-wallet search v1.2 source changes.')
PY

echo "Checking JavaScript syntax..."
node --check server.mjs
node --check public/app.js

echo "Running test suite..."
npm test

echo
printf '%s\n' "SUCCESS: linked-wallet search v1.2 installed and tests passed."
printf '%s\n' "No server restart was performed. Restart manually from the Replit console when ready."

trap - EXIT
rm -rf "$BACKUP"
