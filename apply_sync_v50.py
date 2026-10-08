from pathlib import Path
p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
old="""  // V41: Do not mark an existing policy revoked based on an empty vault alone.
  // Confirmation must contain an owner-submitted signature when policy exists.
  const policyInfo=await conn.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  if(policyInfo && sigs.length===0){
    throw Object.assign(new Error('Owner-signed reclaim confirmation required'),{statusCode:409});
  }
  const vault=new PublicKey(row.vault_address);
"""
new="""  // V50: A successful withdrawal is not proof of policy revocation.
  // Never release the historical session slot or refund the session signer
  // while the deployed policy can still authorize execution.
  const policyInfo=await conn.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  if(policyInfo){
    if(!policyInfo.owner.equals(new PublicKey(row.program_id))){
      throw Object.assign(new Error('On-chain policy is owned by an unexpected program; manual recovery required'),{statusCode:409});
    }
    // Anchor policy account layout: discriminator(8), owner(32), session(32),
    // subscription hash(32), caps(8+8), max sell(2), flags(2), expires(8), revoked(1).
    // Do not assume offsets here: confirm the revoke instruction itself succeeded
    // AND was included in the owner-signed confirmed transaction.
    let sawRevoke=false;
    for(const sig of sigs){
      const tx=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});
      if(!tx||tx.meta?.err)continue;
      const m=tx.transaction.message;
      const keys=(m.staticAccountKeys||m.accountKeys||[]).map(k=>k.toBase58());
      const pi=keys.indexOf(row.program_id), ai=keys.indexOf(row.policy_address);
      const oi=keys.indexOf(row.owner_address);
      if(pi<0||ai<0||oi<0||oi>=m.header.numRequiredSignatures)continue;
      for(const ix of m.compiledInstructions||m.instructions||[]){
        if(ix.programIdIndex!==pi||!(ix.accountKeyIndexes||ix.accounts||[]).includes(ai))continue;
        let data;
        try{data=typeof ix.data==='string'?decodeBase58(ix.data):Buffer.from(ix.data||[])}catch{continue}
        if(data.length===8&&data.equals(REVOKE_DISC))sawRevoke=true;
      }
    }
    if(!sawRevoke){
      throw Object.assign(new Error('Confirmed owner-signed revoke_session instruction required before local session release'),{statusCode:409});
    }
  }
  const vault=new PublicKey(row.vault_address);
"""
if old not in s: raise SystemExit('V50 anchor mismatch: no files modified')
p.write_text(s.replace(old,new,1))
print('V50 reclaim confirmation safety guard applied')
