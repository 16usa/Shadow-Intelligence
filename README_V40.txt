SYNC V40 — FAIL-CLOSED ON-CHAIN IDENTITY GUARD

This patch is a safety correction, NOT a copy-trading activation patch.
It disables the V35 orphan rebind that changes subscription_id without changing the
on-chain PDA. It also checks policy owner and subscription hash in both policy
match paths. It never writes to the SQLite database or submits transactions.

Install from Replit Shell:
unzip -o SYNC_V40_SAFETY.zip && sh apply_sync_v40.sh

Commit and push only the intended files:
git add src/internal-copy-engine.mjs apply_sync_v40.py apply_sync_v40.sh README_V40.txt && (git diff --cached --quiet || git commit -m 'SYNC V40 on-chain identity safety') && git push origin main

The on-chain V39 result showed revoked=true, expired=true and session key mismatch.
Those conditions cannot be repaired by relabeling the local database. Keep the
original vault intact; a separate reviewed reclaim/reauthorization flow is needed.
