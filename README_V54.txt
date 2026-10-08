SYNC V54 — historical session identity guard

Purpose: prevent accidental authorization or active-status evaluation against a historical vault whose subscription ID differs from the current setup. Existing funded vault and reclaim routes remain unchanged.

This is NOT automatic recovery or activation. The on-chain session mismatch shown in V48 means the historical vault cannot safely be rebound to the current subscription by simply editing database IDs. Manual owner-authorized recovery is still required. Do not press STOP & RETURN FUNDS unless you intend to revoke the old policy and reclaim funds.

Install: unzip -o SYNC_V54_SESSION_GUARD.zip && sh apply_sync_v54.sh
Push (no restart): git add src/internal-copy-engine.mjs apply_sync_v54.py apply_sync_v54.sh README_V54.txt && git commit -m 'SYNC V54 historical session guard' && git push origin main
