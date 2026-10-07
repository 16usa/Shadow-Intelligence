#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
ENGINE=ROOT/"src/internal-copy-engine.mjs"
MARK="SYNC_AUTH_TOKEN_RACE_FIX_V28"

if not ENGINE.is_file():
    raise SystemExit("ERROR: src/internal-copy-engine.mjs not found. Run from ~/workspace.")

src=ENGINE.read_text()
if MARK in src:
    print("SYNC AUTH TOKEN RACE FIX V28 ALREADY INSTALLED")
    raise SystemExit(0)

bak=ROOT/"src/internal-copy-engine.mjs.bak-auth-token-v28"
shutil.copy2(ENGINE,bak)

def fail(msg):
    shutil.copy2(bak,ENGINE)
    raise SystemExit("ERROR: "+msg+". Original engine restored.")

try:
    schema_anchor="""    CREATE INDEX IF NOT EXISTS idx_delegated_execution_updated
      ON delegated_copy_executions(updated_at DESC);"""

    schema_extra="""
    /* SYNC_AUTH_TOKEN_RACE_FIX_V28 */
    CREATE TABLE IF NOT EXISTS delegated_copy_action_tokens (
      token_hash TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delegated_action_tokens_subscription
      ON delegated_copy_action_tokens(subscription_id,action,expires_at);
    /* SYNC_AUTH_TOKEN_RACE_FIX_V28_END */"""

    if schema_anchor not in src:
        fail("schema anchor not found")
    src=src.replace(schema_anchor,schema_anchor+schema_extra,1)

    old_issue="""  function issueActionUrl(row,action){
    const token=crypto.randomBytes(32).toString('base64url');
    const exp=new Date(Date.now()+30*60*1000).toISOString();
    const hash=hashHex(`${action}:${token}`);
    db.prepare(`UPDATE delegated_copy_sessions SET auth_token_hash=?,auth_token_expires_at=?,state=?,updated_at=? WHERE subscription_id=?`)
      .run(hash,exp,action==='revoke'?'revocation_required':'authorization_required',now(),row.subscription_id);
    return absUrl(`/execution-authorize.html?mode=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`);
  }
  function actionRow(token,action,userId){
    const hash=hashHex(`${action}:${token}`);
    const row=db.prepare('SELECT * FROM delegated_copy_sessions WHERE auth_token_hash=?').get(hash);
    if(!row||row.user_id!==userId)return null;
    if(!row.auth_token_expires_at||Date.parse(row.auth_token_expires_at)<=Date.now())return null;
    return row;
  }"""

    new_issue="""  /* SYNC_AUTH_TOKEN_RACE_FIX_V28 */
  function cleanupActionTokens(){
    db.prepare('DELETE FROM delegated_copy_action_tokens WHERE expires_at<=?').run(now());
  }
  function issueActionUrl(row,action){
    cleanupActionTokens();
    const token=crypto.randomBytes(32).toString('base64url');
    const exp=new Date(Date.now()+30*60*1000).toISOString();
    const hash=hashHex(`${action}:${token}`);

    // Keep every still-valid short-lived action token. Background status polls
    // may mint a newer URL without invalidating the URL already opened by user.
    db.prepare(`INSERT INTO delegated_copy_action_tokens
      (token_hash,subscription_id,user_id,action,expires_at,created_at)
      VALUES (?,?,?,?,?,?)`)
      .run(hash,row.subscription_id,row.user_id,action,exp,now());

    // Legacy columns remain for compatibility/status display only.
    db.prepare(`UPDATE delegated_copy_sessions
      SET auth_token_hash=?,auth_token_expires_at=?,state=?,updated_at=?
      WHERE subscription_id=?`)
      .run(hash,exp,action==='revoke'?'revocation_required':'authorization_required',now(),row.subscription_id);

    return absUrl(`/execution-authorize.html?mode=${encodeURIComponent(action)}&token=${encodeURIComponent(token)}`);
  }

  function actionRow(token,action,userId){
    cleanupActionTokens();
    const hash=hashHex(`${action}:${token}`);

    const tokenRow=db.prepare(`
      SELECT d.*
      FROM delegated_copy_action_tokens t
      JOIN delegated_copy_sessions d ON d.subscription_id=t.subscription_id
      WHERE t.token_hash=? AND t.action=? AND t.user_id=? AND t.expires_at>?
      LIMIT 1
    `).get(hash,action,userId,now());
    if(tokenRow)return tokenRow;

    // Backward compatibility for a URL issued before V28.
    const legacy=db.prepare('SELECT * FROM delegated_copy_sessions WHERE auth_token_hash=?').get(hash);
    if(!legacy||legacy.user_id!==userId)return null;
    if(!legacy.auth_token_expires_at||Date.parse(legacy.auth_token_expires_at)<=Date.now())return null;
    return legacy;
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
  /* SYNC_AUTH_TOKEN_RACE_FIX_V28_END */"""

    if old_issue not in src:
        fail("issueActionUrl/actionRow block not found")
    src=src.replace(old_issue,new_issue,1)

    old_complete="""      if(complete){
        db.prepare(`UPDATE delegated_copy_sessions
          SET auth_token_hash='',auth_token_expires_at='',state=?,last_error='',updated_at=?
          WHERE subscription_id=?`)
          .run(result.active?'active':'policy_active',now(),row.subscription_id);
      }"""

    new_complete="""      if(complete){
        clearActionTokens(row.subscription_id,'authorize');
        db.prepare(`UPDATE delegated_copy_sessions
          SET auth_token_hash='',auth_token_expires_at='',state=?,last_error='',updated_at=?
          WHERE subscription_id=?`)
          .run(result.active?'active':'policy_active',now(),row.subscription_id);
      }"""

    if old_complete not in src:
        fail("authorization completion block not found")
    src=src.replace(old_complete,new_complete,1)

    old_revoke="""    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`)
      .run(at,at,row.subscription_id);"""

    new_revoke="""    clearActionTokens(row.subscription_id,'revoke');
    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`)
      .run(at,at,row.subscription_id);"""

    if old_revoke not in src:
        fail("revoke completion block not found")
    src=src.replace(old_revoke,new_revoke,1)

    ENGINE.write_text(src)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC AUTH TOKEN RACE FIX V28 INSTALLED")
print("Backup:",bak)
print("")
print("Fix:")
print("  - background status polling can no longer invalidate an authorization URL already opened by the user")
print("  - multiple unexpired short-lived action tokens may coexist safely")
print("  - old pre-V28 token remains compatible until expiry")
print("  - used tokens are removed after successful authorize/revoke")
print("  - no wallet, vault, policy, TP/SL, sizing, balances or funds logic changed")
