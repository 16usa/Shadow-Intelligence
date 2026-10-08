from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
needle='''    let row;
    try{row=ensureSession(canonical)}catch(error){'''
replacement='''    // V35: Rebind an orphaned session only after verifying the original
    // owner, funding wallet, program and existing policy account on-chain.
    // Never rebind a live subscription or an ambiguous/revoked session.
    const existingExact=db.prepare('SELECT 1 FROM delegated_copy_sessions WHERE subscription_id=?').get(canonical.id);
    if(!existingExact){
      const userId=canonical.user_id||canonical.userId;
      const entityId=canonical.entity_id||canonical.entityId;
      const walletId=canonical.user_wallet_id||canonical.userWalletId;
      const walletAddress=canonical.funding_address||canonical.walletAddress;
      const candidates=db.prepare('SELECT * FROM delegated_copy_sessions WHERE user_id=? AND entity_id=?').all(userId,entityId);
      if(candidates.length===1){
        const previous=candidates[0];
        const oldSubscription=db.prepare('SELECT id FROM copy_subscriptions WHERE id=?').get(previous.subscription_id);
        if(!oldSubscription && !previous.revoked_at &&
           previous.owner_address===walletAddress &&
           previous.funding_wallet_id===walletId &&
           previous.program_id===pid.toBase58() &&
           previous.policy_address && previous.vault_address && previous.session_public_key){
          // Fail closed if RPC is unavailable: do not mistake a network error
          // for proof that an authorization exists.
          let verified=false;
          try{
            const info=await connection.getAccountInfo(new PublicKey(previous.policy_address),'confirmed');
            verified=!!info && info.owner.equals(pid) && !!parsePolicyData(info.data);
          }catch(error){lastError=String(error?.message||error)}
          if(verified){
            db.transaction(()=>{
              // Keep the original vault, encrypted session key and policy.
              // Clear stale action links; a new link will be issued if needed.
              db.prepare('DELETE FROM delegated_copy_action_tokens WHERE subscription_id=?').run(previous.subscription_id);
              db.prepare(`UPDATE delegated_copy_sessions SET subscription_id=?,
                auth_token_hash='',auth_token_expires_at='',updated_at=?
                WHERE subscription_id=?`).run(canonical.id,now(),previous.subscription_id);
            })();
          }
        }
      }
    }
    let row;
    try{row=ensureSession(canonical)}catch(error){'''
if s.count(needle)!=1: raise SystemExit('V35 anchor mismatch; no changes')
if 'V35: Rebind an orphaned session' in s: raise SystemExit('V35 already installed')
s=s.replace(needle,replacement,1)
p.write_text(s)
print('SYNC V35 guarded orphan rebind installed')
