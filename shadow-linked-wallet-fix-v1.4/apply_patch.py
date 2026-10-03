from pathlib import Path

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

# 1) /api/entities must expose EVERY linked wallet, not only the first/main wallet.
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
      SELECT id,entity_id,address,label,avatar,avatar_source,chain,
             sync_status,monitoring_enabled,last_scanned_at,created_at
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

# 2) Entity-page filtering recognizes every linked wallet address/label.
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

# 3) Global Search reads linked wallets directly from /api/entities.
# state.details remains a backward-compatible fallback only.
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

# 4) Regression test seeds the DB directly. This deliberately does NOT call the
# wallet-creation endpoint, so the test cannot create a detached sync timer.
anchor="test('first registered user becomes owner',async()=>withServer(async base=>{await registerOwner(base)}));"
new_test=anchor+'''\n\ntest('entity list exposes every linked wallet for global search',async()=>{\n  const { openDb } = await import('../src/db.mjs');\n  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'si-linked-wallet-search-'));\n  const dbPath=path.join(dir,'test.db');\n  const created='2026-01-01T00:00:00.000Z';\n\n  const seed=openDb(dbPath);\n  seed.prepare(`INSERT INTO entities (id,name,x_handle,created_at) VALUES (?,?,?,?)`)\n    .run('ent_search_wallets','Search Wallet Test','@searchwallet',created);\n  seed.prepare(`INSERT INTO wallets (id,entity_id,address,label,created_at) VALUES (?,?,?,?,?)`)\n    .run('wal_search_main','ent_search_wallets',WALLET,'Main wallet',created);\n  seed.prepare(`INSERT INTO wallets (id,entity_id,address,label,created_at) VALUES (?,?,?,?,?)`)\n    .run('wal_search_linked','ent_search_wallets',PUMP,'Linked wallet',created);\n  seed.close();\n\n  const server=createServer({dbPath,fetchImpl:fakeFetch,autoMonitor:false});\n  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));\n  const base=`http://127.0.0.1:${server.address().port}`;\n\n  try{\n    const list=await fetch(base+'/api/entities').then(x=>x.json());\n    const row=list.items.find(x=>x.id==='ent_search_wallets');\n    assert.ok(row);\n    assert.equal(row.mainWalletAddress,WALLET);\n    assert.equal(row.linkedWallets.length,2);\n    assert.deepEqual(row.linkedWallets.map(x=>x.address),[WALLET,PUMP]);\n    assert.deepEqual(row.walletAddresses,[WALLET,PUMP]);\n    assert.equal(row.linkedWallets[1].label,'Linked wallet');\n  }finally{\n    await new Promise(resolve=>server.close(resolve));\n    fs.rmSync(dir,{recursive:true,force:true});\n  }\n});'''
test=replace_once(test,anchor,new_test,'linked wallet regression test anchor')

SERVER.write_text(server)
APP.write_text(app)
TEST.write_text(test)
print('Patch v1.4 applied: linked-wallet payload + search + isolated regression test')
