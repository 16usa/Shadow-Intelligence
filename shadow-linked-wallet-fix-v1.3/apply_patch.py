from pathlib import Path
import sys

ROOT=Path.cwd()
SERVER=ROOT/'server.mjs'
APP=ROOT/'public'/'app.js'
TEST=ROOT/'tests'/'smoke.test.mjs'

for p in (SERVER,APP,TEST):
    if not p.exists():
        raise SystemExit(f'ERROR: expected {p.relative_to(ROOT)} in current workspace')

def replace_once(text, old, new, label):
    count=text.count(old)
    if count != 1:
        raise SystemExit(f'ERROR: {label}: expected exactly 1 match, found {count}. No safe patch applied.')
    return text.replace(old,new,1)

server=SERVER.read_text()
app=APP.read_text()
test=TEST.read_text()

# 1) API knows whether it is running as the long-lived monitored app or a short-lived test server.
server=replace_once(
    server,
    "async function api(req, res, db, url, live) {",
    "async function api(req, res, db, url, live, {backgroundSync=true}={}) {",
    'server api signature'
)

# 2) /api/entities exports every linked wallet, not just the first/main wallet.
old_entity='''    const mainWalletStmt=db.prepare(`
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
new_entity='''    const linkedWalletsStmt=db.prepare(`
      SELECT id,entity_id,address,label,avatar,avatar_source,chain,sync_status,monitoring_enabled,last_scanned_at,created_at
      FROM wallets
      WHERE entity_id=?
      ORDER BY created_at ASC
    `);

    const items=entityRows(db,{solUsd}).map(entity=>{
      const linkedWallets=linkedWalletsStmt.all(entity.id).map(wallet=>({
        ...wallet,
        syncStatus:wallet.sync_status||'pending',
        monitoringEnabled:!!wallet.monitoring_enabled
      }));
      const mainWallet=linkedWallets[0];
      const copy=copyByEntity.get(entity.id);
      return {
        ...entity,
        mainWalletAddress:mainWallet?.address||'',
        linkedWallets,
        walletAddresses:linkedWallets.map(wallet=>wallet.address),
        copyTradingActive:!!copy?.enabled,
        copyTradingState:copy?.engineState||''
      };
    });'''
server=replace_once(server,old_entity,new_entity,'entities linked-wallet payload')

# 3) Creating a wallet only queues the initial live sync on the real monitored server.
# Tests use autoMonitor=false, so no timer may outlive the temporary SQLite DB.
old_sync="    setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();"
new_sync="    if(backgroundSync) setTimeout(()=>live.syncWallet(walletId).catch(err=>console.warn('Initial wallet sync failed:',err.message)),0).unref?.();"
server=replace_once(server,old_sync,new_sync,'initial wallet background sync guard')

# 4) Propagate autoMonitor into API request handling.
old_invoke="      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live); else serveStatic(req,res,url);"
new_invoke="      if(url.pathname.startsWith('/api/')) await api(req,res,db,url,live,{backgroundSync:autoMonitor}); else serveStatic(req,res,url);"
server=replace_once(server,old_invoke,new_invoke,'createServer api invocation')

# 5) Entity-page filtering also recognizes any linked wallet address/label.
old_filter='''  const a=ranked.filter(e=>
    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress].join(' ').toLowerCase().includes(query)
  );'''
new_filter='''  const a=ranked.filter(e=>{
    if(!query)return true;
    const wallets=Array.isArray(e.linkedWallets)?e.linkedWallets:[];
    const hay=[
      e.name,
      e.x_handle,
      e.notes,
      e.mainWalletAddress,
      ...wallets.flatMap(w=>[w.address,w.label])
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(query);
  });'''
app=replace_once(app,old_filter,new_filter,'entity filter linked wallets')

# 6) Global Search reads wallets from the entity-list payload first.
# state.details remains only a fallback for older/partially hydrated state.
old_wallet_search='''  const seenWallets=new Set();
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
new_wallet_search='''  const seenWallets=new Set();

  for(const entity of state.entities||[]){
    for(const rawWallet of (Array.isArray(entity.linkedWallets)?entity.linkedWallets:[])){
      const address=String(rawWallet?.address||'');
      if(!address || seenWallets.has(address))continue;
      const wallet={...rawWallet,entity_id:rawWallet.entity_id||entity.id};
      seenWallets.add(address);
      const hay=[address,wallet.label,entity.name,entity.x_handle,entity.xHandle].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(query)){
        rows.push({
          kind:'wallet',
          item:wallet,
          title:short(address),
          subtitle:entity.x_handle||entity.xHandle||entity.name||wallet.label||'Tracked wallet',
          meta:wallet.label||'Wallet',
          avatar:wallet.avatar?wallet:null
        });
      }
    }
  }

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
          meta:w.label||'Wallet',
          avatar:w.avatar?w:null
        });
      }
    }
  }'''
app=replace_once(app,old_wallet_search,new_wallet_search,'global wallet search source')

# 7) Regression test: two linked wallets must be present in /api/entities and no
# post-test background DB work is allowed when autoMonitor=false.
anchor="test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));"
new_test=anchor+'''\n\ntest('entity list exposes every linked wallet for global search without detached DB work',async()=>withServer(async base=>{\n  const cookie=await registerOwner(base);\n  let r=await authed(base,'/api/entities',cookie,{method:'POST',body:JSON.stringify({name:'Search Wallet Test',xHandle:'@searchwallet'})});\n  assert.equal(r.status,201); const entity=await r.json();\n\n  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:WALLET,label:'Main wallet'})});\n  assert.equal(r.status,201);\n  r=await authed(base,`/api/entities/${entity.id}/wallets`,cookie,{method:'POST',body:JSON.stringify({address:PUMP,label:'Linked wallet'})});\n  assert.equal(r.status,201);\n\n  const list=await fetch(base+'/api/entities').then(x=>x.json());\n  const row=list.items.find(x=>x.id===entity.id);\n  assert.ok(row);\n  assert.equal(row.mainWalletAddress,WALLET);\n  assert.equal(row.linkedWallets.length,2);\n  assert.deepEqual(row.linkedWallets.map(x=>x.address),[WALLET,PUMP]);\n  assert.deepEqual(row.walletAddresses,[WALLET,PUMP]);\n\n  // If wallet creation queued detached sync work on a test server, this delay\n  // would allow it to escape the request lifecycle and race DB teardown.\n  await new Promise(resolve=>setTimeout(resolve,20));\n}));'''
test=replace_once(test,anchor,new_test,'linked wallet regression test anchor')

SERVER.write_text(server)
APP.write_text(app)
TEST.write_text(test)
print('Patch v1.3 applied to server.mjs, public/app.js, tests/smoke.test.mjs')
