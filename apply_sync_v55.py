from pathlib import Path
p=Path('src/sync-vault-reclaim.mjs')
s=p.read_text()
old='''  const reserveRefund=await refundSessionReserve(conn,row);

  return {
    ok:true,
    reclaimed:true,'''
new='''  const reserveRefund=await refundSessionReserve(conn,row);

  // V55: The (user_id, entity_id) unique session slot must not remain
  // occupied forever after a verified owner-signed reclaim. Preserve the
  // historical session verbatim in an audit table before releasing the slot.
  // Never release if the session-signing fee reserve still needs recovery.
  if(!reserveRefund.ok){
    return {ok:true,reclaimed:true,sessionReleased:false,
      message:'Vault reclaimed, but session fee reserve refund is pending. Historical session retained.',
      ownerAddress:row.owner_address,vaultAddress:row.vault_address,
      signatures:sigs,reserveRefund};
  }
  db.exec(`CREATE TABLE IF NOT EXISTS delegated_copy_reclaimed_archive (
    subscription_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    record_json TEXT NOT NULL,
    reclaimed_at TEXT NOT NULL
  )`);
  const release=db.transaction(()=>{
    const current=db.prepare('SELECT * FROM delegated_copy_sessions WHERE subscription_id=?').get(row.subscription_id);
    if(!current || current.state!=='revoked' || !current.revoked_at ||
       current.owner_address!==row.owner_address || current.vault_address!==row.vault_address){
      throw new Error('Historical session changed during reclaim; slot not released');
    }
    db.prepare(`INSERT INTO delegated_copy_reclaimed_archive
      (subscription_id,user_id,entity_id,record_json,reclaimed_at)
      VALUES (?,?,?,?,?)`).run(current.subscription_id,current.user_id,current.entity_id,
      JSON.stringify(current),at);
    const removed=db.prepare(`DELETE FROM delegated_copy_sessions
      WHERE subscription_id=? AND state='revoked' AND revoked_at<>''`).run(current.subscription_id);
    if(removed.changes!==1)throw new Error('Session slot release failed');
  });
  release();

  return {
    ok:true,
    sessionReleased:true,
    reclaimed:true,'''
if 'delegated_copy_reclaimed_archive' in s:
 print('V55 already installed')
elif s.count(old)!=1:
 raise SystemExit('V55 ABORT: expected reclaim anchor missing or ambiguous; no changes')
else:
 p.write_text(s.replace(old,new))
 print('V55 installed: archive verified reclaimed session and release unique slot only after reserve refund')
