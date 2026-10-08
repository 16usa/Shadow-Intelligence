SYNC V43 - fail-closed authorization status guard.
Purpose: Prevent revoked or identity-mismatched on-chain policy from generating new Phantom authorization or funding links in snapshot/status calls.
Does NOT activate copy trading, deploy a program, alter funds or database, or recover a revoked policy.
Install: unzip -o SYNC_V43_STATUS_GUARD.zip && sh apply_sync_v43.sh
Push: git add src/internal-copy-engine.mjs apply_sync_v43.py apply_sync_v43.sh README_V43.txt && (git diff --cached --quiet || git commit -m "SYNC V43 revoked policy status guard") && git push origin main
No automatic restart.
