from pathlib import Path

ROOT = Path.cwd()
SERVER = ROOT / 'server.mjs'
APP = ROOT / 'public' / 'app.js'
TEST = ROOT / 'tests' / 'smoke.test.mjs'

for p in (SERVER, APP, TEST):
    if not p.exists():
        raise SystemExit(f'Required file not found: {p}')


def replace_once(text, old, new, label):
    if new in text:
        print(f'Already patched: {label}')
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Cannot safely patch {label}: expected 1 match, found {count}')
    print(f'Patching: {label}')
    return text.replace(old, new, 1)

server = SERVER.read_text()

old_sig = "async function api(req, res, db, url, live) {"
new_sig = "async function api(req, res, db, url, live, { allowBackgroundSync = true } = {}) {"
server = replace_once(server, old_sig, new_sig, 'API background-sync option')

old_entities = r'''  /* SHADOW_ENTITIES_CARD_INFO_V2417_SERVER */
  if (route === '/api/entities' && method === 'GET') {
    const solUsd=await currentSolUsd();
    const viewer=userFor(req,db);

    const copyByEntity=new Map(
      viewer
        ? db.prepare(`
            SELECT entity_id AS entityId,enabled,engine_state AS engineState
            FROM copy_subscriptions
            WHERE user_id=?
          `).all(viewer.id).map(row=>[row.entityId,row])
        : []
    );

    const mainWalletStmt=db.prepare(`
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
    });

    return json(res,200,{items});
  }
  /* SHADOW_ENTITIES_CARD_INFO_V2417_SERVER_END */'''

new_entities = r'''  /* SHADOW_ENTITIES_CARD_INFO_V2417_SERVER */
  /* SHADOW_LINKED_WALLET_SEARCH_V11_SERVER */
  if (route === '/api/entities' && method === 'GET') {
    const solUsd=await currentSolUsd();
    const viewer=userFor(req,db);

    const copyByEntity=new Map(
      viewer
        ? db.prepare(`
            SELECT entity_id AS entityId,enabled,engine_state AS engineState
            FROM copy_subscriptions
            WHERE user_id=?
          `).all(viewer.id).map(row=>[row.entityId,row])
        : []
    );

    const walletsByEntity=new Map();
    for(const wallet of db.prepare(`
      SELECT id,entity_id,address,label,created_at
      FROM wallets
      ORDER BY created_at ASC
    `).all()){
      const list=walletsByEntity.get(wallet.entity_id)||[];
      list.push({id:wallet.id,address:wallet.address,label:wallet.label||''});
      walletsByEntity.set(wallet.entity_id,list);
    }

    const items=entityRows(db,{solUsd}).map(entity=>{
      const wallets=walletsByEntity.get(entity.id)||[];
      const copy=copyByEntity.get(entity.id);
      return {
        ...entity,
        mainWalletAddress:wallets[0]?.address||'',
        walletAddresses:wallets.map(wallet=>wallet.address),
        wallets,
        copyTradingActive:!!copy?.enabled,
        copyTradingState:copy?.engineState||''
      };
    });

    return json(res,200,{items});
  }
  /* SHADOW_LINKED_WALLET_SEARCH_V11_SERVER_END */
  /* SHADOW_ENTITIES_CARD_INFO_V2417_SERVER_END */'''
server = replace_once(server, old_entities, new_entities, 'entity list exposes all linked wallets')

old_bg = "    setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();"
new_bg = "    if(allowBackgroundSync) setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();"
server = replace_once(server, old_bg, new_bg, 'disable detached initial sync for short-lived test servers')

old_call = "      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);"
new_call = "      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live,{allowBackgroundSync:autoMonitor}); else serveStatic(req,res,url);"
server = replace_once(server, old_call, new_call, 'pass server lifecycle mode to API')

SERVER.write_text(server)

app = APP.read_text()
old_filter = """  const a=ranked.filter(e=>\n    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress].join(' ').toLowerCase().includes(query)\n  );"""
new_filter = """  const a=ranked.filter(e=>\n    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress,...(Array.isArray(e.walletAddresses)?e.walletAddresses:[])].join(' ').toLowerCase().includes(query)\n  );"""
app = replace_once(app, old_filter, new_filter, 'entity page searches every linked wallet')

old_search_start = r'''  for(const e of state.entities||[]){
    const hay=[e.name,e.x_handle,e.xHandle,e.notes].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(query)){
      rows.push({
        kind:'entity',
        id:e.id,
        item:e,
        title:e.x_handle||e.xHandle||e.name||'Entity',
        subtitle:e.name||'Tracked entity',
        avatar:e
      });
    }
  }

  for(const t of state.tokens||[]){'''
new_search_start = r'''  const seenWallets=new Set();

  for(const e of state.entities||[]){
    const walletAddresses=Array.isArray(e.walletAddresses)?e.walletAddresses:[];
    const entityWallets=Array.isArray(e.wallets)?e.wallets:[];
    const hay=[e.name,e.x_handle,e.xHandle,e.notes,e.mainWalletAddress,...walletAddresses]
      .filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(query)){
      rows.push({
        kind:'entity',
        id:e.id,
        item:e,
        title:e.x_handle||e.xHandle||e.name||'Entity',
        subtitle:e.name||'Tracked entity',
        avatar:e
      });
    }

    for(const w of entityWallets){
      const address=String(w?.address||'');
      if(!address || seenWallets.has(address))continue;
      const walletHay=[address,w?.label,e.name,e.x_handle,e.xHandle].filter(Boolean).join(' ').toLowerCase();
      if(walletHay.includes(query)){
        seenWallets.add(address);
        rows.push({
          kind:'wallet',
          item:w,
          title:short(address),
          subtitle:e.x_handle||e.xHandle||e.name||w?.label||'Tracked wallet',
          meta:'Wallet'
        });
      }
    }
  }

  for(const t of state.tokens||[]){'''
app = replace_once(app, old_search_start, new_search_start, 'global search indexes entity-linked wallets')

old_seen = "  const seenWallets=new Set();\n  for(const d of state.details.values()){"
new_seen = "  for(const d of state.details.values()){"
app = replace_once(app, old_seen, new_seen, 'dedupe loaded detail wallets against entity wallet index')
APP.write_text(app)

test = TEST.read_text()
marker = "SHADOW_LINKED_WALLET_SEARCH_V11_TEST"
if marker not in test:
    anchor = "test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));\n"
    if test.count(anchor) != 1:
        raise SystemExit('Cannot safely insert linked-wallet regression test: anchor not found exactly once')
    insert = r'''

// SHADOW_LINKED_WALLET_SEARCH_V11_TEST
test('entity list exposes every linked wallet for global search without detached DB work',async()=>withServer(async base=>{
  const cookie=await registerOwner(base);
  let r=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'linked-search',xHandle:'@linkedsearch'})});
  assert.equal(r.status,201); const entity=await r.json();

  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET,label:'Main wallet'})});
  assert.equal(r.status,201);
  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:MINT,label:'Linked wallet'})});
  assert.equal(r.status,201);

  const list=await authed(base,'/api/entities',cookie).then(x=>x.json());
  const row=list.items.find(x=>x.id===entity.id);
  assert.ok(row);
  assert.equal(row.mainWalletAddress,WALLET);
  assert.deepEqual(row.walletAddresses,[WALLET,MINT]);
  assert.deepEqual(row.wallets.map(x=>x.address),[WALLET,MINT]);
}));
'''
    test = test.replace(anchor, anchor + insert, 1)
    print('Patching: linked-wallet regression test')
else:
    print('Already patched: linked-wallet regression test')
TEST.write_text(test)

print('Shadow linked-wallet search v1.1 patch applied.')
