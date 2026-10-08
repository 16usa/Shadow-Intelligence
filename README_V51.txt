SYNC V51 — reclaim on-chain revocation guard

Run from the project root:
unzip -o SYNC_V51_RECLAIM_VERIFY.zip && sh apply_sync_v51.sh

Patch only src/sync-vault-reclaim.mjs. Does not restart, deploy, touch DB, or send SOL.
Before releasing a historical session, it checks the current on-chain policy
revoked flag, owner, session key and original subscription hash. It preserves
existing safety guards. It does not itself activate copy trading.

After successful install, push:
git add src/sync-vault-reclaim.mjs apply_sync_v51.py apply_sync_v51.sh README_V51.txt && (git diff --cached --quiet || git commit -m 'SYNC V51 on-chain revoke verification') && git push origin main
