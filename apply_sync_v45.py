from pathlib import Path
p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
anchor="  for(const sig of sigs)await waitForSignature(conn,sig);\n\n  // V41: Do not mark an existing policy revoked based on an empty vault alone."
replacement="""  // V45: A confirmed signature alone is NOT evidence of an owner-authorized reclaim.
  // Verify every signature references this policy/program and includes the owner signer.
  if(sigs.length===0){
    throw Object.assign(new Error('Owner-signed reclaim transaction required'),{statusCode:409});
  }
  for(const sig of sigs){
    await waitForSignature(conn,sig);
    const tx=await conn.getTransaction(sig,{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(!tx||tx.meta?.err){
      throw Object.assign(new Error('Reclaim transaction could not be verified'),{statusCode:409});
    }
    const message=tx.transaction.message;
    const keys=message.staticAccountKeys||message.accountKeys||[];
    const keyStrings=keys.map(k=>k.toBase58());
    const ownerIndex=keyStrings.indexOf(row.owner_address);
    if(ownerIndex<0||ownerIndex>=message.header.numRequiredSignatures){
      throw Object.assign(new Error('Reclaim owner signature is missing'),{statusCode:409});
    }
    const programIndex=keyStrings.indexOf(row.program_id);
    const policyIndex=keyStrings.indexOf(row.policy_address);
    if(programIndex<0||policyIndex<0){
      throw Object.assign(new Error('Reclaim policy or program does not match'),{statusCode:409});
    }
    const instructions=message.compiledInstructions||message.instructions||[];
    const matched=instructions.some(ix=>{
      const program=ix.programIdIndex;
      const accounts=ix.accountKeyIndexes||ix.accounts||[];
      if(program!==programIndex||!accounts.includes(policyIndex))return false;
      const data=typeof ix.data==='string'?null:Buffer.from(ix.data||[]);
      return data&&(data.subarray(0,8).equals(WITHDRAW_TOKEN_DISC)||data.subarray(0,8).equals(REVOKE_DISC));
    });
    if(!matched){
      throw Object.assign(new Error('Signature does not contain a valid reclaim instruction'),{statusCode:409});
    }
  }

  // V41: Do not mark an existing policy revoked based on an empty vault alone."""
if 'V45: A confirmed signature alone' in s:
 print('V45 already applied')
elif s.count(anchor)!=1:
 raise SystemExit('V45 anchor mismatch; no changes made')
else:
 s=s.replace(anchor,replacement,1)
 p.write_text(s)
 print('V45 reclaim signature validation applied')
