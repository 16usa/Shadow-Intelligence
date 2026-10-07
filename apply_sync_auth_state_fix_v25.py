#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT=Path.cwd()
ENGINE=ROOT/"src/internal-copy-engine.mjs"
UI=ROOT/"public/execution-authorize.js"
MARK="SYNC_AUTH_STATE_FIX_V25"

for p in (ENGINE,UI):
    if not p.is_file():
        raise SystemExit(f"ERROR: {p} not found. Run from ~/workspace.")

engine=ENGINE.read_text()
ui=UI.read_text()

if MARK in engine and MARK in ui:
    print("SYNC AUTH STATE FIX V25 ALREADY INSTALLED")
    raise SystemExit(0)

engine_bak=ROOT/"src/internal-copy-engine.mjs.bak-auth-state-v25"
ui_bak=ROOT/"public/execution-authorize.js.bak-auth-state-v25"
shutil.copy2(ENGINE,engine_bak)
shutil.copy2(UI,ui_bak)

def fail(msg):
    shutil.copy2(engine_bak,ENGINE)
    shutil.copy2(ui_bak,UI)
    raise SystemExit("ERROR: "+msg+". Originals restored.")

try:
    if MARK not in engine:
        anchor="  async function confirmAction(token,userId,action='authorize',signature=''){"
        if anchor not in engine:
            fail("confirmAction anchor not found")

        helper='''  /* SYNC_AUTH_STATE_FIX_V25 */
  async function waitForConfirmedAuthorizationSignature(signature,timeoutMs=25000){
    const sig=String(signature||'').trim();
    if(!sig)throw Object.assign(new Error('Wallet transaction signature is missing'),{statusCode:400});
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const response=await connection.getSignatureStatuses([sig],{searchTransactionHistory:true});
      const status=response.value?.[0]||null;
      if(status?.err){
        throw Object.assign(
          new Error(`On-chain transaction failed: ${JSON.stringify(status.err)}`),
          {statusCode:409}
        );
      }
      if(status&&(status.confirmationStatus==='confirmed'||status.confirmationStatus==='finalized')){
        return status;
      }
      await new Promise(resolve=>setTimeout(resolve,650));
    }
    throw Object.assign(
      new Error('Authorization transaction was submitted but is not confirmed yet. Refresh status in a few seconds.'),
      {statusCode:409}
    );
  }

  function authorizationStillNeedsWallet(result){
    const state=String(result?.authorizationState||'').trim().toLowerCase();
    return [
      'authorization_required',
      'policy_update_required',
      'funding_required',
      'fee_reserve_required'
    ].includes(state);
  }
  /* SYNC_AUTH_STATE_FIX_V25_END */

'''
        engine=engine.replace(anchor,helper+anchor,1)

        old='''  async function confirmAction(token,userId,action='authorize',signature=''){
    const row=actionRow(token,action,userId);if(!row)throw Object.assign(new Error('Delegated action link is invalid or expired'),{statusCode:410});
    if(signature){const status=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});const s=status.value?.[0];if(s?.err)throw Object.assign(new Error(`On-chain transaction failed: ${JSON.stringify(s.err)}`),{statusCode:409})}
    const exists=await onchainPolicyExists(row);
    if(action==='authorize'&&!exists)throw Object.assign(new Error('Delegated policy account is not active on-chain yet'),{statusCode:409});
    const at=now();
    if(action==='authorize'){
      db.prepare(`UPDATE delegated_copy_sessions SET state='policy_active',authorized_at=?,revoked_at='',auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
      const sub=subRow(db,row.subscription_id);
      if(!sub)throw Object.assign(new Error('Copy subscription not found'),{statusCode:404});
      const result=await snapshot(sub,{issueToken:false});
      db.prepare(`UPDATE copy_subscriptions SET enabled=?,engine_state=?,last_error=?,updated_at=? WHERE id=?`).run(
        result.active?1:0,
        result.active?'active':String(result.authorizationState||'pending'),
        result.active?'':String(result.executionReadyReason||''),
        at,
        sub.id
      );
      return result;
    }
    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`).run(at,at,row.subscription_id);
    const sub=subRow(db,row.subscription_id);
    if(sub)db.prepare(`UPDATE copy_subscriptions SET enabled=0,engine_state='stopped',last_error='',updated_at=? WHERE id=?`).run(at,sub.id);
    let feeReserveRefund={refundedLamports:'0',signature:''};
    try{feeReserveRefund=await refundSessionFeeReserve(row)}catch(error){lastError=`fee reserve refund: ${String(error?.message||error)}`}
    return {active:false,authorizationState:'revoked',revoked:true,feeReserveRefund,executionWallet:{...publicSession(sessionRow(db,row.subscription_id)),status:'revoked'}};
  }'''

        new='''  async function confirmAction(token,userId,action='authorize',signature=''){
    const row=actionRow(token,action,userId);
    if(!row)throw Object.assign(new Error('Delegated action link is invalid or expired'),{statusCode:410});

    // V25: do not accept a submitted signature until Solana reports confirmed/finalized.
    if(signature)await waitForConfirmedAuthorizationSignature(signature);

    const exists=await onchainPolicyExists(row);
    if(action==='authorize'&&!exists){
      throw Object.assign(new Error('Delegated policy account is not active on-chain yet'),{statusCode:409});
    }

    const at=now();
    if(action==='authorize'){
      db.prepare(`UPDATE delegated_copy_sessions SET state='policy_active',authorized_at=?,revoked_at='',updated_at=? WHERE subscription_id=?`)
        .run(at,at,row.subscription_id);

      const sub=subRow(db,row.subscription_id);
      if(!sub)throw Object.assign(new Error('Copy subscription not found'),{statusCode:404});

      let result=await snapshot(sub,{issueToken:false});
      for(let i=0;i<10&&authorizationStillNeedsWallet(result);i++){
        await new Promise(resolve=>setTimeout(resolve,500));
        result=await snapshot(sub,{issueToken:false});
      }

      const complete=!authorizationStillNeedsWallet(result);
      if(complete){
        db.prepare(`UPDATE delegated_copy_sessions
          SET auth_token_hash='',auth_token_expires_at='',state=?,last_error='',updated_at=?
          WHERE subscription_id=?`)
          .run(result.active?'active':'policy_active',now(),row.subscription_id);
      }

      db.prepare(`UPDATE copy_subscriptions SET enabled=?,engine_state=?,last_error=?,updated_at=? WHERE id=?`).run(
        result.active?1:0,
        result.active?'active':String(result.authorizationState||'pending'),
        complete?'':String(result.executionReadyReason||result.authorizationState||'authorization_not_ready'),
        now(),
        sub.id
      );

      return {...result,authorizationConfirmed:complete};
    }

    db.prepare(`UPDATE delegated_copy_sessions SET state='revoked',revoked_at=?,auth_token_hash='',auth_token_expires_at='',updated_at=? WHERE subscription_id=?`)
      .run(at,at,row.subscription_id);
    const sub=subRow(db,row.subscription_id);
    if(sub)db.prepare(`UPDATE copy_subscriptions SET enabled=0,engine_state='stopped',last_error='',updated_at=? WHERE id=?`).run(at,sub.id);
    let feeReserveRefund={refundedLamports:'0',signature:''};
    try{feeReserveRefund=await refundSessionFeeReserve(row)}catch(error){lastError=`fee reserve refund: ${String(error?.message||error)}`}
    return {active:false,authorizationState:'revoked',revoked:true,feeReserveRefund,executionWallet:{...publicSession(sessionRow(db,row.subscription_id)),status:'revoked'}};
  }'''

        if old not in engine:
            fail("current confirmAction block not found")
        engine=engine.replace(old,new,1)

    if MARK not in ui:
        old='''const result=await api('/api/copy-engine/authorization/confirm',{method:'POST',body:JSON.stringify({token,action:mode,signature})});status(mode==='revoke'?'24/7 delegation revoked on-chain.':'SYNC 24/7 execution is authorized. Your scoped session reserve pays network fees; trading limits remain enforced by the signed on-chain policy.');$('#status').className='status good';
      if(mode==='authorize'){
        showCopyTradingCta();
      }else{
        setTimeout(()=>{location.replace('/sync.html')},900);
      }
      return result'''

        new='''const result=await api('/api/copy-engine/authorization/confirm',{method:'POST',body:JSON.stringify({token,action:mode,signature})});
      if(mode==='authorize'){
        const authState=String(result&&result.authorizationState||'').trim().toLowerCase();
        const stillNeedsWallet=['authorization_required','policy_update_required','funding_required','fee_reserve_required'].includes(authState);
        const confirmed=result&&result.authorizationConfirmed===true&&!stillNeedsWallet;
        if(!confirmed){
          throw new Error('Authorization transaction is confirmed, but execution is not ready yet ('+(authState||'pending')+'). Tap Refresh status or authorize again only if requested.');
        }
        status(result.active===true
          ?'SYNC 24/7 execution is authorized and ready.'
          :'SYNC 24/7 authorization is confirmed. Execution status: '+(authState||'ready')+'.');
        $('#status').className='status good';
        showCopyTradingCta();
      }else{
        status('24/7 delegation revoked on-chain.');
        $('#status').className='status good';
        setTimeout(()=>{location.replace('/sync.html')},900);
      }
      return result /* SYNC_AUTH_STATE_FIX_V25 */'''

        if old not in ui:
            fail("authorization success UI block not found")
        ui=ui.replace(old,new,1)

    ENGINE.write_text(engine)
    UI.write_text(ui)

except SystemExit:
    raise
except Exception as e:
    fail(str(e))

print("SYNC AUTH STATE FIX V25 INSTALLED")
print("Backups:")
print(" ",engine_bak)
print(" ",ui_bak)
print("Fix:")
print("  waits for Solana confirmed/finalized before accepting authorization")
print("  re-reads policy/vault/reserve until confirmed state is visible")
print("  no false 'authorized' message")
print("  auth token stays valid if another wallet action is genuinely required")
