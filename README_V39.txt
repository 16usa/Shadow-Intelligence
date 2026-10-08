SYNC V39 — read-only on-chain vault identity verification.
Requires project's existing @solana/web3.js dependency and RPC configuration.
Run: sh run_sync_v39.sh
Does not alter database, wallets, sessions, or submit transactions.
Push: git add verify_sync_v39.mjs run_sync_v39.sh README_V39.txt && (git diff --cached --quiet || git commit -m "SYNC V39 on-chain verification") && git push origin main
