SYNC V47 read-only historical authorization audit.
Checks all delegated_copy_sessions against existing on-chain policies.
No files, DB records, secrets, wallets or Solana accounts are modified.
POTENTIALLY_USABLE is not authorization to trade; a further code review is required.
Run: unzip -o SYNC_V47_AUDIT.zip && sh run_sync_v47.sh
Push: git add check_sync_v47.mjs run_sync_v47.sh README_V47.txt && (git diff --cached --quiet || git commit -m "SYNC V47 historical session audit") && git push origin main
