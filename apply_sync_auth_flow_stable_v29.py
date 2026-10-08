#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
ENGINE=ROOT/"src/internal-copy-engine.mjs"
SERVER=ROOT/"server.mjs"
UI=ROOT/"public/execution-authorize.js"
MARK="SYNC_AUTH_FLOW_STABLE_V29"

for p in (ENGINE,SERVER,UI):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

engine=ENGINE.read_text()
server=SERVER.read_text()
ui=UI.read_text()

if MARK in engine and MARK in server and MARK in ui:
    print("SYNC AUTH FLOW STABLE V29 ALREADY INSTALLED")
    raise SystemExit(0)

backups = {
    ENGINE: ROOT/"src/internal-copy-engine.mjs.bak-auth-flow-v29",
    SERVER: ROOT/"server.mjs.bak-auth-flow-v29",
    UI: ROOT/"public/execution-authorize.js.bak-auth-flow-v29",
}
for src,bak in backups.items():
    shutil.copy2(src,bak)

def restore():
    for src,bak in backups.items():
        shutil.copy2(bak,src)

def fail(msg):
    restore()
    raise SystemExit("ERROR: "+msg+". Originals restored.")

try:
    old_table = '''    CREATE TABLE IF NOT EXISTS delegated_copy_action_tokens (
      token_hash TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );'''
    new_table = '''    CREATE TABLE IF NOT EXISTS delegated_copy_action_tokens (
      token_hash TEXT PRIMARY KEY,
      token_value TEXT NOT NULL DEFAULT '',
      subscription_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );'''
    if old_table in engine:
        engine=engine.replace(old_table,new_table,1)

    schema_anchor = '''  /* SYNC_COPY_STATUS_LIVE_V18_SCHEMA */
  const executionColumns=new Set('''
    schema_insert = '''  /* SYNC_AUTH_FLOW_STABLE_V29 */
  const actionTokenColumns=new Set(
    db.prepare("PRAGMA table_info(delegated_copy_action_tokens)").all().map(row=>String(row.name||''))
  );
  if(!actionTokenColumns.has('token_value')){
    db.exec("ALTER TABLE delegated_copy_action_tokens ADD COLUMN token_value TEXT NOT NULL DEFAULT ''");
  }
  /* SYNC_AUTH_FLOW_STABLE_V29_END */

'''
    if MARK not in engine:
        if schema_anchor not in engine:
            fail("engine schema migration anchor not found")
        engine=engine.replace(schema_anchor,schema_insert+schema_anchor,1)

    start=engine.find("  function cleanupActionTokens(){")
    end=engine.find("  /* SYNC_AUTH_TOKEN_RACE_FIX_V28_END */",start)
    if start<0 or end<0:
        fail("V28 action-token block not found")
    end += len("  /* SYNC_AUTH_TOKEN_RACE_FIX_V28_END */")

    new_token_block = '''  /* SYNC_AUTH_TOKEN_RACE_FIX_V28 */
  /* SYNC_AUTH_FLOW_STABLE_V29 */
  function cleanupActionTokens(){
    db.prepare('DELETE FROM delegated_copy_action_tokens WHERE expires_at<=?').run(now());
  }

  function actionUrlFor(row,action,token){
    // Stay on the exact origin/process/database that issued this token.
    return `/execution-authorize.html?mode=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}&entity=${encodeURIComponent(row.entity_id||'')}`;
  }

  function issueActionUrl(row,action){
    cleanupActionTokens();

    // Background status polling must not rotate the authorization link.
    const reusable=db.prepare(`
      SELECT token_value,expires_at
      FROM delegated_copy_action_tokens
      WHERE subscription_id=? AND user_id=? AND action=? AND expires_at>? AND token_value<>''
      ORDER BY created_at DESC
      LIMIT 1
    `).get(row.subscription_id,row.user_id,action,now());

    if(reusable?.token_value){
      return actionUrlFor(row,action,reusable.token_value);
    }

    const token=crypto.randomBytes(32).toString('base64url');
    const exp=new Date(Date.now()+30*60*1000).toISOString();
    const hash=hashHex(`${action}:${token}`);

    db.prepare(`INSERT INTO delegated_copy_action_tokens
      (token_hash,token_value,subscription_id,user_id,action,expires_at,created_at)
      VALUES (?,?,?,?,?,?,?)`)
      .run(hash,token,row.subscription_id,row.user_id,action,exp,now());

    db.prepare(`UPDATE delegated_copy_sessions
      SET auth_token_hash=?,auth_token_expires_at=?,state=?,updated_at=?
      WHERE subscription_id=?`)
      .run(hash,exp,action==='revoke'?'revocation_required':'authorization_required',now(),row.subscription_id);

    return actionUrlFor(row,action,token);
  }

  function currentAuthorizeRow(userId,entityId){
    const entity=String(entityId||'').trim();
    if(!entity)return null;

    const sub=db.prepare(`
      SELECT id
      FROM copy_subscriptions
      WHERE user_id=? AND entity_id=?
      LIMIT 1
    `).get(userId,entity);
    if(!sub?.id)return null;

    const row=sessionRow(db,sub.id);
    if(!row)return null;
    if(String(row.user_id)!==String(userId))return null;
    if(String(row.entity_id)!==entity)return null;
    return row;
  }

  function actionRow(token,action,userId,entityId=''){
    cleanupActionTokens();
    const raw=String(token||'').trim();

    if(raw){
      const hash=hashHex(`${action}:${raw}`);

      const tokenRow=db.prepare(`
        SELECT d.*
        FROM delegated_copy_action_tokens t
        JOIN delegated_copy_sessions d ON d.subscription_id=t.subscription_id
        WHERE t.token_hash=? AND t.action=? AND t.user_id=? AND t.expires_at>?
        LIMIT 1
      `).get(hash,action,userId,now());

      if(tokenRow && (!entityId || String(tokenRow.entity_id)===String(entityId))){
        return tokenRow;
      }

      const legacy=db.prepare('SELECT * FROM delegated_copy_sessions WHERE auth_token_hash=?').get(hash);
      if(legacy && legacy.user_id===userId &&
         legacy.auth_token_expires_at &&
         Date.parse(legacy.auth_token_expires_at)>Date.now() &&
         (!entityId || String(legacy.entity_id)===String(entityId))){
        return legacy;
      }
    }

    // Authorize-only self-heal by authenticated user + entity.
    if(action==='authorize'){
      return currentAuthorizeRow(userId,entityId);
    }
    return null;
  }

  function clearActionTokens(subscriptionId,action=''){
    if(action){
      db.prepare('DELETE FROM delegated_copy_action_tokens WHERE subscription_id=? AND action=?')
        .run(subscriptionId,action);
    }else{
      db.prepare('DELETE FROM delegated_copy_action_tokens WHERE subscription_id=?')
        .run(subscriptionId);
    }
  }
  /* SYNC_AUTH_FLOW_STABLE_V29_END */
  /* SYNC_AUTH_TOKEN_RACE_FIX_V28_END */'''

    engine=engine[:start]+new_token_block+engine[end:]

    engine=engine.replace(
        "function authorizationDetails(token,userId,action='authorize'){",
        "function authorizationDetails(token,userId,action='authorize',entityId=''){",
        1
    )
    engine=engine.replace(
        "const row=actionRow(token,action,userId);if(!row)return null;",
        "const row=actionRow(token,action,userId,entityId);if(!row)return null;",
        1
    )

    engine=engine.replace(
        "async function prepareAction(token,userId,action='authorize'){",
        "async function prepareAction(token,userId,action='authorize',entityId=''){",
        1
    )
    prep_sig="async function prepareAction(token,userId,action='authorize',entityId=''){"
    prep_pos=engine.find(prep_sig)
    if prep_pos<0:
        fail("prepareAction signature patch failed")
    prep_row=engine.find("const row=actionRow(token,action,userId);",prep_pos)
    if prep_row<0:
        fail("prepareAction actionRow anchor not found")
    engine=engine[:prep_row]+engine[prep_row:].replace(
        "const row=actionRow(token,action,userId);",
        "const row=actionRow(token,action,userId,entityId);",
        1
    )

    engine=engine.replace(
        "async function confirmAction(token,userId,action='authorize',signature=''){",
        "async function confirmAction(token,userId,action='authorize',signature='',entityId=''){",
        1
    )
    conf_sig="async function confirmAction(token,userId,action='authorize',signature='',entityId=''){"
    conf_pos=engine.find(conf_sig)
    if conf_pos<0:
        fail("confirmAction signature patch failed")
    conf_row=engine.find("const row=actionRow(token,action,userId);",conf_pos)
    if conf_row<0:
        fail("confirmAction actionRow anchor not found")
    engine=engine[:conf_row]+engine[conf_row:].replace(
        "const row=actionRow(token,action,userId);",
        "const row=actionRow(token,action,userId,entityId);",
        1
    )

    old_routes = '''  if(route==='/api/copy-engine/authorization' && method==='GET'){
    const user=requireUser(req,res,db); if(!user)return;
    const token=String(url.searchParams.get('token')||'');
    const action=String(url.searchParams.get('action')||'authorize')==='revoke'?'revoke':'authorize';
    const details=globalThis.__SHADOW_INTERNAL_COPY_ENGINE?.authorizationDetails(token,user.id,action);
    if(!details)return json(res,410,{error:'Delegated action link is invalid or expired'});
    return json(res,200,details);
  }
  if(route==='/api/copy-engine/authorization/prepare' && method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req); const token=String(b.token||''); const action=String(b.action||'authorize')==='revoke'?'revoke':'authorize';
    try{return json(res,200,await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.prepareAction(token,user.id,action));}
    catch(error){return json(res,error.statusCode||400,{error:String(error.message||error)});}
  }
  if(route==='/api/copy-engine/authorization/confirm' && method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req); const token=String(b.token||''); const action=String(b.action||'authorize')==='revoke'?'revoke':'authorize';
    try{return json(res,200,{ok:true,...await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.confirmAction(token,user.id,action,String(b.signature||''))});}
    catch(error){return json(res,error.statusCode||400,{error:String(error.message||error)});}
  }'''

    new_routes = '''  /* SYNC_AUTH_FLOW_STABLE_V29 */
  if(route==='/api/copy-engine/authorization' && method==='GET'){
    const user=requireUser(req,res,db); if(!user)return;
    const token=String(url.searchParams.get('token')||'');
    const entity=clean(url.searchParams.get('entity'),120);
    const action=String(url.searchParams.get('action')||'authorize')==='revoke'?'revoke':'authorize';
    const details=globalThis.__SHADOW_INTERNAL_COPY_ENGINE?.authorizationDetails(token,user.id,action,entity);
    if(!details)return json(res,410,{error:'Delegated action link is invalid or expired'});
    return json(res,200,details);
  }
  if(route==='/api/copy-engine/authorization/prepare' && method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req);
    const token=String(b.token||'');
    const entity=clean(b.entity,120);
    const action=String(b.action||'authorize')==='revoke'?'revoke':'authorize';
    try{return json(res,200,await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.prepareAction(token,user.id,action,entity));}
    catch(error){return json(res,error.statusCode||400,{error:String(error.message||error)});}
  }
  if(route==='/api/copy-engine/authorization/confirm' && method==='POST'){
    const user=requireUser(req,res,db); if(!user)return;
    const b=await readJson(req);
    const token=String(b.token||'');
    const entity=clean(b.entity,120);
    const action=String(b.action||'authorize')==='revoke'?'revoke':'authorize';
    try{return json(res,200,{ok:true,...await globalThis.__SHADOW_INTERNAL_COPY_ENGINE.confirmAction(token,user.id,action,String(b.signature||''),entity)});}
    catch(error){return json(res,error.statusCode||400,{error:String(error.message||error)});}
  }
  /* SYNC_AUTH_FLOW_STABLE_V29_END */'''

    if old_routes not in server:
        fail("server authorization route block not found")
    server=server.replace(old_routes,new_routes,1)

    old_qs = "const qs=new URLSearchParams(location.search);const token=qs.get('token')||'';const mode=qs.get('mode')==='revoke'?'revoke':'authorize';"
    new_qs = "const qs=new URLSearchParams(location.search);const token=qs.get('token')||'';const entity=qs.get('entity')||'';const mode=qs.get('mode')==='revoke'?'revoke':'authorize'; /* SYNC_AUTH_FLOW_STABLE_V29 */"
    if old_qs not in ui:
        fail("authorization page query parser anchor not found")
    ui=ui.replace(old_qs,new_qs,1)

    old_load = '''  async function load(){
    try{
      render(await api(`/api/copy-engine/authorization?token=${encodeURIComponent(token)}&action=${mode}`));
      status('Ready. This is an on-chain policy transaction, not a transfer to SYNC.');
      if(mode==='authorize'){
        try{if(sessionStorage.getItem('sync24_authorized')==='1')showCopyTradingCta()}catch{}
      }
    }catch(e){
      if(mode==='authorize'){
        try{
          if(sessionStorage.getItem('sync24_authorized')==='1'){
            status('SYNC 24/7 execution is authorized.');
            $('#status').className='status good';
            showCopyTradingCta();
            return;
          }
        }catch{}
      }
      status(e.message);
      $('#actionBtn').disabled=true;
    }
  }'''

    new_load = '''  async function load(){
    try{
      render(await api(`/api/copy-engine/authorization?token=${encodeURIComponent(token)}&action=${mode}&entity=${encodeURIComponent(entity)}`));
      status('Ready. This is an on-chain policy transaction, not a transfer to SYNC.');
      $('#status').className='status';
    }catch(e){
      status(e.message);
      $('#status').className='status bad';
      $('#actionBtn').disabled=true;
    }
  }'''

    if old_load not in ui:
        fail("authorization page load block not found")
    ui=ui.replace(old_load,new_load,1)

    if "body:JSON.stringify({token,action:mode})" not in ui:
        fail("prepare request body anchor not found")
    ui=ui.replace(
        "body:JSON.stringify({token,action:mode})",
        "body:JSON.stringify({token,action:mode,entity})",
        1
    )

    if "body:JSON.stringify({token,action:mode,signature})" not in ui:
        fail("confirm request body anchor not found")
    ui=ui.replace(
        "body:JSON.stringify({token,action:mode,signature})",
        "body:JSON.stringify({token,action:mode,signature,entity})",
        1
    )

    ENGINE.write_text(engine)
    SERVER.write_text(server)
    UI.write_text(ui)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC AUTH FLOW STABLE V29 INSTALLED")
print("Backups:")
for p in backups.values():
    print(" ",p)
print("")
print("Fixes:")
print("  - authorization URL stays on the same origin/database")
print("  - polling reuses one unexpired authorization URL")
print("  - stale authorize token self-heals to current same-user/entity session")
print("  - revoke remains strict-token")
print("  - sessionStorage no longer acts as authorization truth")
print("  - no private keys, vault balances, TP/SL, trade sizing or program ID changed")
