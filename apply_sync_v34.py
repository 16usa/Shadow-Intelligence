from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
anchor='''    const pid=programId();
    const master=parseSessionMasterKey();
    if(!pid||!master)return null;
    const owner=new PublicKey(subscription.funding_address||subscription.walletAddress);'''
replacement='''    // V34: Never create a second delegated session for the same user/entity.
    // Existing vaults may hold funds; wallet changes require explicit recovery.
    const conflict=db.prepare(`SELECT subscription_id,owner_address,policy_address,vault_address
      FROM delegated_copy_sessions WHERE user_id=? AND entity_id=? LIMIT 1`).get(
      subscription.user_id||subscription.userId,subscription.entity_id||subscription.entityId);
    if(conflict){
      const error=new Error('Existing delegated vault belongs to another Copy Setup or funding wallet. Reconnect the original wallet; no new authorization was created.');
      error.code='DELEGATED_SESSION_REBIND_REQUIRED';
      error.statusCode=409;
      error.existingSubscriptionId=conflict.subscription_id;
      throw error;
    }
    const pid=programId();
    const master=parseSessionMasterKey();
    if(!pid||!master)return null;
    const owner=new PublicKey(subscription.funding_address||subscription.walletAddress);'''
if s.count(anchor)!=1: raise SystemExit('ANCHOR MISMATCH; NO CHANGES')
s=s.replace(anchor,replacement,1)
# Ensure background polling gets structured blocked state, not recurring 500.
anchor2='''    let row=ensureSession(canonical);if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};'''
replacement2='''    let row;
    try{row=ensureSession(canonical)}catch(error){
      if(error?.code==='DELEGATED_SESSION_REBIND_REQUIRED'){
        return {active:false,authorizationState:'session_rebind_required',
          executionReady:false,executionReadyReason:'DELEGATED_SESSION_REBIND_REQUIRED',
          message:String(error.message),authorizationUrl:'',executionWallet:null};
      }
      throw error;
    }
    if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};'''
if s.count(anchor2)!=1:raise SystemExit('SNAPSHOT ANCHOR MISMATCH; NO CHANGES')
s=s.replace(anchor2,replacement2,1)
p.write_text(s)
print('SYNC V34 conflict guard installed')
