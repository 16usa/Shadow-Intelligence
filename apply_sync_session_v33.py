from pathlib import Path
import shutil,sys
p=Path('src/internal-copy-engine.mjs')
if not p.exists(): sys.exit('ERROR: src/internal-copy-engine.mjs not found')
s=p.read_text()
start=s.find('function sessionRow(db,subscriptionId){')
end=s.find('\nfunction publicSession(',start)
if start<0 or end<0:sys.exit('ERROR: sessionRow anchor missing; no files changed')
old=s[start:end]
if 'SYNC_SAFE_SESSION_REBIND_V33' in old:sys.exit('Already installed')
new='''function sessionRow(db,subscriptionId){
  // SYNC_SAFE_SESSION_REBIND_V33
  // Resolve a recreated copy setup without choosing an arbitrary historical
  // authorization. Fail closed on ambiguity, revoked or expired sessions.
  const exact=db.prepare('SELECT * FROM delegated_copy_sessions WHERE subscription_id=?').get(subscriptionId);
  if(exact)return exact;
  const current=db.prepare(`
    SELECT s.user_id,s.entity_id,s.user_wallet_id,uw.address AS funding_address
    FROM copy_subscriptions s
    JOIN user_wallets uw ON uw.id=s.user_wallet_id
    WHERE s.id=?
  `).get(subscriptionId);
  if(!current)return null;
  const candidates=db.prepare(`
    SELECT * FROM delegated_copy_sessions
    WHERE user_id=? AND entity_id=? AND owner_address=?
    ORDER BY created_at DESC
  `).all(current.user_id,current.entity_id,current.funding_address);
  const active=candidates.filter(row=>{
    if(row.revoked_at)return false;
    if(!row.policy_address||!row.session_public_key||!row.vault_address)return false;
    if(row.funding_wallet_id && row.funding_wallet_id!==current.user_wallet_id)return false;
    return true;
  });
  // No arbitrary LIMIT 1: multiple historical sessions need explicit
  // verification against the on-chain policy before reusing any of them.
  if(active.length!==1)return null;
  return active[0];
}'''
backup=p.with_name(p.name+'.bak-safe-rebind-v33')
shutil.copy2(p,backup)
p.write_text(s[:start]+new+s[end:])
print('SYNC SAFE SESSION REBIND V33 INSTALLED')
print('Backup:',backup)
print('Note: ambiguous sessions remain blocked until on-chain verification.')
