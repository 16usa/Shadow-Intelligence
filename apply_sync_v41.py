from pathlib import Path
import subprocess

p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
old='''function sessionRow(db,userId,entityId){
  return db.prepare(`
    SELECT d.*,s.enabled AS subscription_enabled,s.engine_state,
           uw.address AS funding_address
    FROM delegated_copy_sessions d
    JOIN copy_subscriptions s ON s.id=d.subscription_id
    JOIN user_wallets uw ON uw.id=s.user_wallet_id
    WHERE d.user_id=? AND d.entity_id=? AND s.user_id=?
    LIMIT 1
  `).get(userId,entityId,userId)||null;
}'''
new='''function sessionRow(db,userId,entityId){
  // V41: The original copy subscription may have been deleted or recreated.
  // Reclaim must resolve the ORIGINAL vault, never derive a new PDA.
  // Require a verified wallet record for the same user and owner address.
  const rows=db.prepare(`
    SELECT d.*,uw.address AS funding_address
    FROM delegated_copy_sessions d
    JOIN user_wallets uw
      ON uw.user_id=d.user_id AND uw.address=d.owner_address
    WHERE d.user_id=? AND d.entity_id=?
    LIMIT 2
  `).all(userId,entityId);
  if(rows.length>1){
    throw Object.assign(new Error('Ambiguous delegated vault sessions; reclaim stopped'),{statusCode:409});
  }
  return rows[0]||null;
}'''
if 'V41: The original copy subscription' in s:
    print('V41 already applied')
    raise SystemExit(0)
if s.count(old)!=1:raise SystemExit('V41 anchor mismatch; no files modified')
s=s.replace(old,new,1)
# Prevent marking policy revoked without any owner-signed chain transaction.
anchor='''  const vault=new PublicKey(row.vault_address);
  const remaining=await vaultAssets(conn,vault);'''
replacement='''  // V41: Do not mark an existing policy revoked based on an empty vault alone.
  // Confirmation must contain an owner-submitted signature when policy exists.
  const policyInfo=await conn.getAccountInfo(new PublicKey(row.policy_address),'confirmed');
  if(policyInfo && sigs.length===0){
    throw Object.assign(new Error('Owner-signed reclaim confirmation required'),{statusCode:409});
  }
  const vault=new PublicKey(row.vault_address);
  const remaining=await vaultAssets(conn,vault);'''
if s.count(anchor)!=1:raise SystemExit('V41 confirm anchor mismatch; no files modified')
s=s.replace(anchor,replacement,1)
# atomic write only after both anchors match
p.write_text(s)
subprocess.run(['node','--check',str(p)],check=True)
print('SYNC V41 reclaim orphan lookup fixed; node syntax OK; no DB modifications')
