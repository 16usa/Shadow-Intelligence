SYNC V55 — post-reclaim session slot release

Fixes: after verified owner-signed reclaim and successful session reserve refund, the historical delegated_copy_sessions row remained under UNIQUE(user_id,entity_id), permanently blocking new authorization. V55 archives the row transactionally before deleting it, only within a successfully confirmed owner-signed reclaim. The historical session remains untouched until reclaim succeeds.

IMPORTANT: This does NOT activate copy trading and does NOT execute reclaim. Do not press Stop & Return Funds unless you explicitly want to withdraw vault funds and revoke its existing policy. New authorization is a separate, owner-approved action. Archived records contain encrypted session metadata; protect the database as before.

Install: unzip -o SYNC_V55_RECLAIM_SLOT_FIX.zip && sh apply_sync_v55.sh
Push: git add src/sync-vault-reclaim.mjs apply_sync_v55.py apply_sync_v55.sh README_V55.txt && git commit -m "SYNC V55 safe post-reclaim session release" && git push origin main
