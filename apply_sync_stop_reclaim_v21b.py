#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
SERVER=ROOT/"server.mjs"
SYNC=ROOT/"public/sync.js"
MODULE=ROOT/"src/sync-vault-reclaim.mjs"
HTML=ROOT/"public/execution-reclaim.html"
JS=ROOT/"public/execution-reclaim.js"
MARK="SYNC_STOP_RECLAIM_V21B"

for p in (SERVER,SYNC):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

server=SERVER.read_text()
sync=SYNC.read_text()

if MARK in server and MARK in sync and MODULE.exists() and HTML.exists() and JS.exists():
    print("SYNC STOP RECLAIM V21B ALREADY INSTALLED")
    raise SystemExit(0)

server_bak=ROOT/"server.mjs.bak-stop-reclaim-v21b"
sync_bak=ROOT/"public/sync.js.bak-stop-reclaim-v21b"
shutil.copy2(SERVER,server_bak)
shutil.copy2(SYNC,sync_bak)

payload=ROOT/"sync-v21b-payload"
module_src=(payload/"sync-vault-reclaim.mjs").read_text()
html_src=(payload/"execution-reclaim.html").read_text()
js_src=(payload/"execution-reclaim.js").read_text()

def fail(msg):
    shutil.copy2(server_bak,SERVER)
    shutil.copy2(sync_bak,SYNC)
    raise SystemExit("ERROR: "+msg+". Original server.mjs/public/sync.js restored.")

try:
    import_anchor="import { createInternalCopyEngine } from './src/internal-copy-engine.mjs';"
    if MARK not in server:
        if import_anchor not in server:
            fail("server import anchor not found")
        server=server.replace(
            import_anchor,
            import_anchor+"\nimport { getVaultReclaimStatus, prepareVaultReclaim, confirmVaultReclaim } from './src/sync-vault-reclaim.mjs'; // "+MARK,
            1
        )

    route_marker="  /* SHADOW_DELEGATED_COPY_ENGINE_V340_ROUTES */"
    if "copy/reclaim/prepare" not in server:
        if route_marker not in server:
            fail("delegated route marker not found")
        routes="""  /* SYNC_STOP_RECLAIM_V21B_ROUTES */
  if(parts[0]==='api'&&parts[1]==='entities'&&parts[2]&&parts[3]==='copy'&&parts[4]==='reclaim'&&parts.length===5&&method==='GET'){
    const user=requireUser(req,res,db); if(!user)return;
    try{return json(res,200,await getVaultReclaimStatus(db,user.id,parts[2]));}
    catch(error){return json(res,error.statusCode||500,{error:String(error.message||error)});}
  }
  if(parts[0]==='api'&&parts[1]==='entities'&&parts[2]&&parts[3]==='copy'&&parts[4]==='reclaim'&&parts[5]==='prepare'&&parts.length===6&&method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    try{return json(res,200,await prepareVaultReclaim(db,user.id,parts[2]));}
    catch(error){return json(res,error.statusCode||500,{error:String(error.message||error)});}
  }
  if(parts[0]==='api'&&parts[1]==='entities'&&parts[2]&&parts[3]==='copy'&&parts[4]==='reclaim'&&parts[5]==='confirm'&&parts.length===6&&method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    const body=await readJson(req);
    try{return json(res,200,await confirmVaultReclaim(db,user.id,parts[2],Array.isArray(body.signatures)?body.signatures:[]));}
    catch(error){return json(res,error.statusCode||500,{error:String(error.message||error)});}
  }
  /* SYNC_STOP_RECLAIM_V21B_ROUTES_END */

"""
        server=server.replace(route_marker,routes+route_marker,1)

    if "reclaimRequired:!!reclaimUrl" not in server:
        old="return json(res,200,{ok:true,subscription:copySubscriptionRow(db,user.id,entity.id),engine});"
        pos=server.find(old)
        if pos<0:
            fail("disabled copy response anchor not found")
        repl="""const reclaimSession=db.prepare('SELECT 1 FROM delegated_copy_sessions WHERE user_id=? AND entity_id=? LIMIT 1').get(user.id,entity.id);
      const reclaimUrl=reclaimSession?`/execution-reclaim.html?entity=${encodeURIComponent(entity.id)}`:'';
      return json(res,200,{ok:true,subscription:copySubscriptionRow(db,user.id,entity.id),engine,reclaimRequired:!!reclaimUrl,reclaimUrl});"""
        server=server[:pos]+server[pos:].replace(old,repl,1)

    if MARK not in sync:
        anchor="state.copy=result.subscription||state.copy;"
        if anchor not in sync:
            fail("sync saveCopy result anchor not found")
        inject="""/* SYNC_STOP_RECLAIM_V21B */
      if(!enabled&&result.reclaimUrl){
        location.href=String(result.reclaimUrl);
        return;
      }
      """
        sync=sync.replace(anchor,inject+anchor,1)

    SERVER.write_text(server)
    SYNC.write_text(sync)
    MODULE.parent.mkdir(parents=True,exist_ok=True)
    MODULE.write_text(module_src)
    HTML.write_text(html_src)
    JS.write_text(js_src)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC STOP RECLAIM V21B INSTALLED")
print("Backups:")
print(" ",server_bak)
print(" ",sync_bak)
print("Flow:")
print("  STOP COPYING -> owner-signed vault return -> revoke -> reserve refund")
print("No owner private key is stored or used by the server.")
