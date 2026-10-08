from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
marker='// SYNC_V42_REVOKED_POLICY_GUARD'
if marker in s:
    print('V42 already installed')
    raise SystemExit(0)
old='''    const policy=await policyState(row);
    const exists=!!policy;
'''
new='''    const policy=await policyState(row);
    // SYNC_V42_REVOKED_POLICY_GUARD: a revoked on-chain policy cannot be
    // repaired by updating local IDs or silently re-signing the old policy.
    // Keep the original vault available to the owner-only reclaim flow.
    if(policy?.revoked){
      return {active:false,policyActive:false,authorizationState:'session_rebind_required',
        executionReady:false,executionReadyReason:'ONCHAIN_POLICY_REVOKED',
        message:'On-chain policy is revoked. Old vault must be reclaimed before creating a separate new authorization.',
        authorizationUrl:'',executionWallet:null};
    }
    const exists=!!policy;
'''
if s.count(old)!=1:raise SystemExit('V42 snapshot anchor mismatch; no changes')
s=s.replace(old,new,1)
old2='''      const exists=await onchainPolicyExists(row);
      if(!exists){'''
new2='''      const chainPolicy=await policyState(row);
      if(chainPolicy?.revoked){
        throw Object.assign(new Error('On-chain policy is revoked. Reclaim the original vault first; do not sign another authorization for this policy.'),{statusCode:409});
      }
      if(chainPolicy && (chainPolicy.owner!==row.owner_address ||
          chainPolicy.subscriptionHash!==idHash(row.subscription_id).toString('hex') ||
          chainPolicy.sessionKey!==row.session_public_key)){
        throw Object.assign(new Error('On-chain policy identity mismatch. Authorization blocked to protect existing vault.'),{statusCode:409});
      }
      const exists=await onchainPolicyExists(row);
      if(!exists){'''
if s.count(old2)!=1:raise SystemExit('V42 authorization anchor mismatch; no changes')
s=s.replace(old2,new2,1)
p.write_text(s)
print('V42 installed: revoked policy blocked before signing; vault unchanged')
