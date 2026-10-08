#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
SERVER=ROOT/"server.mjs"
UI=ROOT/"public/sync.js"
MARK="SYNC_ORPHAN_SUBSCRIPTION_FIX_V30"

for p in (SERVER, UI):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

server=SERVER.read_text()
ui=UI.read_text()

if MARK in server and MARK in ui:
    print("SYNC ORPHAN SUBSCRIPTION FIX V30 ALREADY INSTALLED")
    raise SystemExit(0)

server_bak=ROOT/"server.mjs.bak-orphan-sub-v30"
ui_bak=ROOT/"public/sync.js.bak-orphan-sub-v30"
shutil.copy2(SERVER,server_bak)
shutil.copy2(UI,ui_bak)

def restore():
    shutil.copy2(server_bak,SERVER)
    shutil.copy2(ui_bak,UI)

def fail(msg):
    restore()
    raise SystemExit("ERROR: "+msg+". Originals restored.")

try:
    old_delete = """  if (parts[0]==='api' && parts[1]==='user-wallets' && parts[2] && parts.length===3 && method==='DELETE') {
    const user=requireUser(req,res,db); if(!user)return;
    const row=db.prepare('SELECT id FROM user_wallets WHERE id=? AND user_id=?').get(parts[2],user.id);
    if(!row)return json(res,404,{error:'Wallet not found'});
    db.prepare('DELETE FROM user_wallets WHERE id=? AND user_id=?').run(parts[2],user.id);
    return json(res,200,{ok:true});
  }"""

    new_delete = """  /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30 */
  if (parts[0]==='api' && parts[1]==='user-wallets' && parts[2] && parts.length===3 && method==='DELETE') {
    const user=requireUser(req,res,db); if(!user)return;
    const row=db.prepare('SELECT id,address FROM user_wallets WHERE id=? AND user_id=?').get(parts[2],user.id);
    if(!row)return json(res,404,{error:'Wallet not found'});

    const delegated=db.prepare(`
      SELECT subscription_id,entity_id,state,vault_address,policy_address
      FROM delegated_copy_sessions
      WHERE user_id=? AND owner_address=?
        AND COALESCE(state,'') NOT IN ('revoked','removed')
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(user.id,row.address);

    const liveSub=db.prepare(`
      SELECT id,entity_id,enabled,engine_state
      FROM copy_subscriptions
      WHERE user_id=? AND user_wallet_id=?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(user.id,row.id);

    if(delegated || liveSub){
      return json(res,409,{
        error:'Stop copy trading and reclaim/revoke delegated execution before disconnecting this wallet',
        code:'DELEGATED_SESSION_EXISTS',
        entityId:String(delegated?.entity_id||liveSub?.entity_id||''),
        subscriptionId:String(delegated?.subscription_id||liveSub?.id||'')
      });
    }

    db.prepare('DELETE FROM user_wallets WHERE id=? AND user_id=?').run(parts[2],user.id);
    return json(res,200,{ok:true});
  }
  /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30_END */"""

    if old_delete not in server:
        fail("wallet DELETE route anchor not found")
    server=server.replace(old_delete,new_delete,1)

    old_exec = """    let engine=null,executionWallet=executionAuthorizationRow(db,user.id,entity.id);
    if(subscription&&fundingWallet){
      try{engine=await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.syncSubscription({action:'upsert',subscription:{...subscription,funding_address:fundingWallet.address,walletAddress:fundingWallet.address,userId:user.id,entityId:entity.id}});executionWallet=persistExecutionAuthorization(db,{subscription,userId:user.id,entityId:entity.id,fundingWalletId:fundingWallet.id,engine});
        if(engine?.executionWallet?.authorizationUrl)executionWallet.authorizationUrl=engine.executionWallet.authorizationUrl;
        if(engine?.revocationUrl||engine?.executionWallet?.revocationUrl)executionWallet.revocationUrl=engine.revocationUrl||engine.executionWallet.revocationUrl;
        executionWallet.authorizationState=engine?.authorizationState||executionWallet.authorizationState;
      }catch{}
    }
    return json(res,200,{ok:true,subscription,mainWallet:mainWallet?{id:mainWallet.id,address:mainWallet.address,label:mainWallet.label||'Main Wallet'}:null,fundingWallet,executionWallet,engineConfigured:globalThis.__SHADOW_INTERNAL_COPY_ENGINE?.status()?.configured===true,engine,mainWalletOnly:true,linkedWalletsTrading:false,nonCustodial:true});"""

    new_exec = """    /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30 */
    let engine=null;
    let executionWallet=subscription?executionAuthorizationRow(db,user.id,entity.id):null;
    let orphanedSession=null;

    if(!subscription){
      const orphan=db.prepare(`
        SELECT subscription_id,entity_id,owner_address,state,authorized_at,
               revoked_at,policy_address,vault_address,updated_at
        FROM delegated_copy_sessions
        WHERE user_id=? AND entity_id=?
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(user.id,entity.id);

      if(orphan){
        orphanedSession={
          subscriptionId:String(orphan.subscription_id||''),
          entityId:String(orphan.entity_id||''),
          ownerAddress:String(orphan.owner_address||''),
          state:String(orphan.state||''),
          authorizedAt:String(orphan.authorized_at||''),
          revokedAt:String(orphan.revoked_at||''),
          policyAddress:String(orphan.policy_address||''),
          vaultAddress:String(orphan.vault_address||''),
          updatedAt:String(orphan.updated_at||'')
        };
      }
    }

    if(subscription&&fundingWallet){
      try{
        engine=await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.syncSubscription({
          action:'upsert',
          subscription:{
            ...subscription,
            funding_address:fundingWallet.address,
            walletAddress:fundingWallet.address,
            userId:user.id,
            entityId:entity.id
          }
        });
        executionWallet=persistExecutionAuthorization(db,{
          subscription,
          userId:user.id,
          entityId:entity.id,
          fundingWalletId:fundingWallet.id,
          engine
        });
        if(engine?.executionWallet?.authorizationUrl)executionWallet.authorizationUrl=engine.executionWallet.authorizationUrl;
        if(engine?.revocationUrl||engine?.executionWallet?.revocationUrl)executionWallet.revocationUrl=engine.revocationUrl||engine.executionWallet.revocationUrl;
        executionWallet.authorizationState=engine?.authorizationState||executionWallet.authorizationState;
      }catch{}
    }

    return json(res,200,{
      ok:true,
      subscription,
      mainWallet:mainWallet?{id:mainWallet.id,address:mainWallet.address,label:mainWallet.label||'Main Wallet'}:null,
      fundingWallet,
      executionWallet,
      orphanedSession,
      repairRequired:!!orphanedSession&&!subscription,
      engineConfigured:globalThis.__SHADOW_INTERNAL_COPY_ENGINE?.status()?.configured===true,
      engine,
      mainWalletOnly:true,
      linkedWalletsTrading:false,
      nonCustodial:true
    });
    /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30_END */"""

    if old_exec not in server:
        fail("copy execution GET route anchor not found")
    server=server.replace(old_exec,new_exec,1)

    anchor = """    sub=db.prepare('SELECT * FROM copy_subscriptions WHERE id=?').get(subId);
    const entityWallets=mainCopyWalletRows(db,entity.id); // Main Wallet only · Linked Wallets are intelligence-only"""

    insert = """    sub=db.prepare('SELECT * FROM copy_subscriptions WHERE id=?').get(subId);

    /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30_REBIND */
    ensureExecutionWalletSchema(db);
    db.prepare(`
      UPDATE execution_wallet_authorizations
      SET subscription_id=?,
          funding_wallet_id=?,
          authorization_state='rebind_pending',
          authorization_url='',
          last_error='',
          updated_at=?
      WHERE user_id=? AND entity_id=? AND subscription_id<>?
    `).run(subId,wallet.id,nowIso(),user.id,entity.id,subId);
    /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30_REBIND_END */

    const entityWallets=mainCopyWalletRows(db,entity.id); // Main Wallet only · Linked Wallets are intelligence-only"""

    if anchor not in server:
        fail("copy subscription rebind anchor not found")
    server=server.replace(anchor,insert,1)

    old_load = """    try{
      state.execution=await api("/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy/execution");
      state.authorizationUrl=authorizationFromExecution(state.execution);
    }catch(error){
      state.execution=null;
    }"""

    new_load = """    try{
      state.execution=await api("/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy/execution");

      /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30 */
      if(state.copy){
        state.authorizationUrl=authorizationFromExecution(state.execution);
      }else{
        state.authorizationUrl="";
      }
      /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30_END */
    }catch(error){
      state.execution=null;
      state.authorizationUrl="";
    }"""

    if old_load not in ui:
        fail("loadCopyState execution anchor not found")
    ui=ui.replace(old_load,new_load,1)

    old_needs = """    var needsAuthorization=!!(
      !active &&
      state.authorizationUrl &&
      !authorized
    );"""

    new_needs = """    var needsAuthorization=!!(
      sub &&
      !active &&
      state.authorizationUrl &&
      !authorized
    ); /* SYNC_ORPHAN_SUBSCRIPTION_FIX_V30 */"""

    if old_needs not in ui:
        fail("renderCopyState needsAuthorization anchor not found")
    ui=ui.replace(old_needs,new_needs,1)

    SERVER.write_text(server)
    UI.write_text(ui)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC ORPHAN SUBSCRIPTION FIX V30 INSTALLED")
print("Backups:")
print(" ",server_bak)
print(" ",ui_bak)
print("")
print("What V30 fixes:")
print("  - stale delegated authorization URLs are ignored when copy_subscriptions is missing")
print("  - START COPYING recreates the canonical subscription and V16 can rebind the existing delegated session")
print("  - stale execution_wallet_authorizations metadata is rebound to the new subscription")
print("  - Disconnect can no longer cascade-delete copy_subscriptions while a delegated session still exists")
print("  - no on-chain transaction, signature, balance, vault or funds were changed by this installer")
