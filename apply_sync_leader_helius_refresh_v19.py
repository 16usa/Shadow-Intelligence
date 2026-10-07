#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
SERVER=ROOT/"server.mjs"
MARK="SYNC_LEADER_HELIUS_REFRESH_V19"

if not SERVER.is_file():
    raise SystemExit("ERROR: server.mjs not found. Run from ~/workspace.")

text=SERVER.read_text()

if MARK in text:
    print("SYNC LEADER HELIUS REFRESH V19 ALREADY INSTALLED")
    raise SystemExit(0)

backup=ROOT/"server.mjs.bak-leader-helius-v19"
shutil.copy2(SERVER,backup)

old="""  if (route === '/api/public-copy-room/config' && method === 'PUT') {
    const owner=requireOwner(req,res,db); if(!owner)return;
    const body=await readJson(req);
    const entityId=clean(body.entityId,120);
    if(entityId && !db.prepare('SELECT 1 FROM entities WHERE id=?').get(entityId)){
      return json(res,404,{error:'Leader entity not found'});
    }
    const stmt=db.prepare(
      'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    stmt.run('public_copy_leader_entity_id',entityId);
    stmt.run('public_copy_room_enabled',body.enabled===false?'false':'true');
    return json(res,200,{
      ok:true,
      enabled:body.enabled!==false,
      leaderEntityId:entityId
    });
  }"""

new="""  if (route === '/api/public-copy-room/config' && method === 'PUT') {
    const owner=requireOwner(req,res,db); if(!owner)return;
    const body=await readJson(req);
    const entityId=clean(body.entityId,120);
    if(entityId && !db.prepare('SELECT 1 FROM entities WHERE id=?').get(entityId)){
      return json(res,404,{error:'Leader entity not found'});
    }
    const stmt=db.prepare(
      'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    );
    stmt.run('public_copy_leader_entity_id',entityId);
    stmt.run('public_copy_room_enabled',body.enabled===false?'false':'true');

    /* SYNC_LEADER_HELIUS_REFRESH_V19 */
    // Selecting a room leader must immediately move the one-wallet Helius
    // subscription to that leader. Previously the room changed in the UI/DB
    // while Helius could keep listening to the previous leader until a later
    // refresh/restart.
    let leaderWallet=null;
    if(entityId){
      leaderWallet=mainCopyWalletRows(db,entityId)[0]||null;
      if(leaderWallet?.id){
        db.prepare("UPDATE wallets SET monitoring_enabled=1 WHERE id=?").run(leaderWallet.id);
      }
    }

    let realtime=null;
    try{
      realtime=await live.refreshRealtimeWebhook();
    }catch(error){
      console.warn('SYNC leader Helius refresh failed:',String(error?.message||error));
      realtime={active:false,lastError:String(error?.message||error)};
    }
    /* SYNC_LEADER_HELIUS_REFRESH_V19_END */

    return json(res,200,{
      ok:true,
      enabled:body.enabled!==false,
      leaderEntityId:entityId,
      leaderWalletId:leaderWallet?.id||'',
      helius:{
        active:!!realtime?.active,
        addressCount:Number(realtime?.addressCount||0),
        lastConfigAt:String(realtime?.lastConfigAt||''),
        lastError:String(realtime?.lastError||'')
      }
    });
  }"""

if old not in text:
    raise SystemExit("ERROR: public-copy-room config anchor not found. No files changed.")

try:
    SERVER.write_text(text.replace(old,new,1))
except Exception:
    shutil.copy2(backup,SERVER)
    raise

print("SYNC LEADER HELIUS REFRESH V19 INSTALLED")
print("Fix:")
print("  SAVE ROOM -> selected Main Wallet monitoring ON -> Helius webhook refresh immediately")
print("Backup:", backup)
print("No Program ID, private keys, vault balances, TP/SL, or execution sizing changed.")
