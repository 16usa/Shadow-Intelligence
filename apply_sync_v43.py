from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
marker='    const policy=await policyState(row);\n    const exists=!!policy;'
insert='''    const policy=await policyState(row);
    // V43: An on-chain revoked policy cannot be reauthorized by changing local metadata.
    // Never issue a Phantom link or request a top-up for an unusable old vault.
    if(policy?.revoked){
      return {active:false,policyActive:false,authorizationState:'revoked_policy_recovery_required',
        executionReady:false,executionReadyReason:'ONCHAIN_POLICY_REVOKED',
        message:'The existing on-chain policy is revoked. No authorization or funding transaction will be prepared. Preserve the original vault and use the owner-controlled reclaim flow.',
        authorizationUrl:'',executionWallet:null};
    }
    if(policy && (policy.owner!==row.owner_address ||
       policy.sessionKey!==row.session_public_key ||
       policy.subscriptionHash!==idHash(row.subscription_id).toString('hex'))){
      return {active:false,policyActive:false,authorizationState:'policy_identity_mismatch',
        executionReady:false,executionReadyReason:'ONCHAIN_POLICY_IDENTITY_MISMATCH',
        message:'On-chain policy identity does not match the saved session. No authorization or funding transaction will be prepared.',
        authorizationUrl:'',executionWallet:null};
    }
    const exists=!!policy;'''
if 'V43: An on-chain revoked policy' in s:
 print('V43 already installed')
elif s.count(marker)!=1:
 raise SystemExit('V43 anchor mismatch: no changes made')
else:
 s=s.replace(marker,insert,1)
 p.write_text(s)
 print('V43 revoked/identity guard installed; no database changes')
