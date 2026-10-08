from pathlib import Path
p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
needle="""    if(!sawRevoke){
      throw Object.assign(new Error('Confirmed owner-signed revoke_session instruction required before local session release'),{statusCode:409});
    }
  }
  const vault=new PublicKey(row.vault_address);"""
replacement="""    if(!sawRevoke){
      throw Object.assign(new Error('Confirmed owner-signed revoke_session instruction required before local session release'),{statusCode:409});
    }
    // V51: A revoke instruction in a successful transaction is not sufficient
    // by itself. Verify the *current* on-chain policy is revoked and belongs
    // to the historical owner, signer and subscription before local release.
    const data=Buffer.from(policyInfo.data||[]);
    // Anchor discriminator(8), owner(32), session(32), subscription hash(32),
    // expires(8), trade cap(8), daily cap(8), spent(8), day index(8),
    // sell bps(2), copy buys(1), copy sells(1), revoked(1).
    const revokedOffset=8+32+32+32+8+8+8+8+8+2+1+1;
    const expectedHash=sha256(row.subscription_id);
    if(data.length<=revokedOffset ||
       !data.subarray(8,40).equals(new PublicKey(row.owner_address).toBuffer()) ||
       !data.subarray(40,72).equals(new PublicKey(row.session_public_key).toBuffer()) ||
       !data.subarray(72,104).equals(expectedHash) ||
       data[revokedOffset]!==1){
      throw Object.assign(new Error('On-chain policy is not verified as revoked for this historical session; local release blocked'),{statusCode:409});
    }
  }
  const vault=new PublicKey(row.vault_address);"""
if s.count(needle)!=1:
    raise SystemExit('V51 anchor mismatch: no changes made')
s2=s.replace(needle,replacement)
backup=p.with_suffix('.mjs.bak-v51')
# No DB access, and no writes unless anchor is exact.
backup.write_text(s)
p.write_text(s2)
print('V51 on-chain revocation verification installed. No DB or Solana transaction performed.')
