from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
old="""    const exists=await onchainPolicyExists(row);
    if(action==='authorize'&&!exists){
      throw Object.assign(new Error('Delegated policy account is not active on-chain yet'),{statusCode:409});
    }

    const at=now();"""
new="""    // V49: A confirmed transaction does not prove that this particular
    // subscription was authorized. Verify the existing policy identity and
    // its original wallet before modifying any local authorization state.
    if(action==='authorize'){
      const sub=subRow(db,row.subscription_id);
      if(!sub || sub.id!==row.subscription_id ||
         sub.user_id!==row.user_id || sub.entity_id!==row.entity_id ||
         sub.user_wallet_id!==row.funding_wallet_id ||
         sub.funding_address!==row.owner_address){
        throw Object.assign(new Error('Original subscription and funding wallet must match the delegated policy. No authorization state changed.'),{statusCode:409});
      }
      const chain=await policyState(row);
      if(!chain || chain.revoked ||
         chain.expiresAt<=Math.floor(Date.now()/1000)+300 ||
         chain.owner!==row.owner_address ||
         chain.sessionKey!==row.session_public_key ||
         chain.subscriptionHash!==idHash(row.subscription_id).toString('hex')){
        throw Object.assign(new Error('On-chain delegated policy is absent, expired, revoked, or belongs to a different identity. No authorization state changed.'),{statusCode:409});
      }
    }

    const at=now();"""
if old in s:
    s=s.replace(old,new,1)
    p.write_text(s)
    print('V49 installed: on-chain authorization identity guard')
elif '// V49: A confirmed transaction does not prove' in s:
    print('V49 already installed')
else:
    raise SystemExit('V49 anchor mismatch: NO CHANGES; do not push')
