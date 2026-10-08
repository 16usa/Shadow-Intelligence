SYNC V41 — Orphaned Vault Reclaim Guard

This patch only modifies src/sync-vault-reclaim.mjs.
- Allows reclaim status/prepare/confirm to find the ORIGINAL delegated vault when the original copy subscription was deleted.
- Requires same user, entity, and a verified user_wallets row matching the original vault owner address.
- Fails closed if multiple rows match.
- Does not rebind a session, create a vault, sign transactions, or change the database during installation.
- Prevents confirm from marking an existing policy revoked with zero submitted signatures.
- Does not reactivate revoked/expired on-chain policies or start copy trading.

Install: unzip -o SYNC_V41_RECLAIM_FIX.zip && sh apply_sync_v41.sh
Push: git add src/sync-vault-reclaim.mjs apply_sync_v41.py apply_sync_v41.sh README_V41.txt && (git diff --cached --quiet || git commit -m "SYNC V41 orphan vault reclaim guard") && git push origin main
