from pathlib import Path
import subprocess
p=Path('src/internal-copy-engine.mjs')
s=p.read_text()
marker='    const exists=!!policy;\n    if(exists&&!row.authorized_at)'
replacement='''    // V44: expired policies cannot execute. Do not request funds or Phantom
    // authorization for an unusable session. Preserve vault and DB records.
    if(policy && policy.expiresAt <= Math.floor(Date.now()/1000)+300){
      return {active:false,policyActive:false,authorizationState:'expired_policy_recovery_required',
        executionReady:false,executionReadyReason:'ONCHAIN_POLICY_EXPIRED',
        message:'Existing on-chain policy has expired. Old vault preserved; no signing or funding requested.',
        authorizationUrl:'',executionWallet:null};
    }
    const exists=!!policy;
    if(exists&&!row.authorized_at)'''
if 'V44: expired policies cannot execute' in s:
 print('V44 already applied')
elif s.count(marker)!=1:
 raise SystemExit('V44 anchor mismatch: no changes made')
else:
 candidate=s.replace(marker,replacement,1)
 tmp=p.with_suffix('.v44-check.mjs')
 tmp.write_text(candidate)
 try:
  subprocess.run(['node','--check',str(tmp)],check=True)
  p.write_text(candidate)
  print('V44 applied; syntax OK; no DB or Solana transactions')
 finally:
  tmp.unlink(missing_ok=True)
