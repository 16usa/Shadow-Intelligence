from pathlib import Path
p=Path('src/internal-copy-engine.mjs')
if not p.exists(): raise SystemExit('ERROR: run in repository root; source file not found')
s=p.read_text()
needle='''    if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};
    const policy=await policyState(row);'''
replacement='''    if(!row)return {active:false,authorizationState:'error',message:'Could not create delegated session metadata'};
    // V54: a historical session cannot authorize or execute a recreated copy setup.
    // Its PDA and on-chain subscription hash are tied to the original ID.
    // Do not mutate IDs, issue action tokens, or prompt the owner to sign.
    if(String(row.subscription_id)!==String(canonical.id)){
      return {active:false,policyActive:false,authorizationState:'session_rebind_required',
        executionReady:false,executionReadyReason:'HISTORICAL_SESSION_ID_MISMATCH',
        message:'Existing vault belongs to a historical copy setup. Review the vault and recover it with the original owner wallet; do not sign a new authorization.',
        authorizationUrl:'',executionWallet:null};
    }
    const policy=await policyState(row);'''
if replacement in s: print('V54 already applied'); raise SystemExit(0)
if s.count(needle)!=1: raise SystemExit('ERROR: expected code anchor not found exactly once; no changes made')
p.write_text(s.replace(needle,replacement))
print('V54 installed: historical-session authorization guard; no DB changes or transactions')
