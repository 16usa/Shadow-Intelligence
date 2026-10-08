SYNC V46: Fix Solana base58 instruction decoding in owner-signed reclaim verification.
No deploy, no database modifications, no Solana transaction. This does not activate trading.
Run: unzip -o SYNC_V46_RECLAIM_DECODE.zip && sh apply_sync_v46.sh
Push: git add src/sync-vault-reclaim.mjs apply_sync_v46.py apply_sync_v46.sh README_V46.txt && (git diff --cached --quiet || git commit -m 'SYNC V46 reclaim base58 verification') && git push origin main
