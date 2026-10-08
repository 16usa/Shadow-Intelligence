SYNC V50 — reclaim confirmation safety guard

This patch fixes a concrete safety bug: a confirmed owner-signed withdrawal could mark a session revoked locally even if the on-chain policy had not been revoked. Now a confirmed revoke_session instruction is required whenever the on-chain policy account still exists.

This does NOT automatically rebind old sessions, activate copy trading, or eliminate network transaction fees. The V48 audit ruled out safe automatic reuse. It does NOT redeploy a program, transfer SOL, or modify the database during installation.

Install from repository root: unzip -o SYNC_V50_RECLAIM_GUARD.zip && sh apply_sync_v50.sh
The installer commits and pushes the changes to main after syntax verification.
