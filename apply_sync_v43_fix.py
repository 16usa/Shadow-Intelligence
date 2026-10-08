from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
if 'SYNC_V43_FIXED_IDENTITY_GUARD' in s:
 print('V43 fix already installed')
 raise SystemExit(0)
anchor='''    const exists=!!policy;
    if(exists&&!row.authorized_at)'''
replacement='''    // SYNC_V43_FIXED_IDENTITY_GUARD: fail closed before issuing wallet actions.
    if(policy && (policy.owner!==row.owner_address ||
       policy.sessionKey!==row.session_public_key ||
       policy.subscriptionHash!==idHash(row.subscription_id).toString('hex'))){
      return {active:false,policyActive:false,authorizationState:'policy_identity_mismatch',
        executionReady:false,executionReadyReason:'ONCHAIN_POLICY_IDENTITY_MISMATCH',
        message:'On-chain policy identity mismatch. Existing vault preserved; no signing or funding requested.',
        authorizationUrl:'',executionWallet:null};
    }
    const exists=!!policy;
    if(exists&&!row.authorized_at)'''
if s.count(anchor)!=1:raise SystemExit('V43 fix anchor mismatch; no changes')
s=s.replace(anchor,replacement,1)
p.write_text(s)
print('V43 fixed identity guard installed; no DB or Solana transactions')
