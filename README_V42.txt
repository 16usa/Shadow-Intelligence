SYNC V42 - Revoked on-chain policy fail-closed guard.
Prevents authorization/signing for a revoked or identity-mismatched on-chain policy.
Does NOT restore trading or migrate funds. Existing vault remains untouched.
Run: unzip -o SYNC_V42_GUARD.zip && sh apply_sync_v42.sh
Push: git add src/internal-copy-engine.mjs apply_sync_v42.py apply_sync_v42.sh README_V42.txt && (git diff --cached --quiet || git commit -m 'SYNC V42 revoked policy guard') && git push origin main
