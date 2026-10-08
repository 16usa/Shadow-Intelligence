SYNC V48 — read-only candidate identity audit.
Run: unzip -o SYNC_V48_IDENTITY_AUDIT.zip && sh run_sync_v48.sh
Push: git add check_sync_v48.mjs run_sync_v48.sh README_V48.txt && (git diff --cached --quiet || git commit -m "SYNC V48 candidate identity audit") && git push origin main
This does NOT reactivate copy trading, modify the database, move SOL, or deploy a program.
POTENTIALLY_USABLE in V47 does not imply safe reuse by a different user/entity/subscription.
