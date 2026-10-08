SYNC V33 — safe session lookup hardening

This patch removes arbitrary historical session selection (LIMIT 1) from sessionRow.
It permits reuse only if exactly one matching, non-revoked, same-user/entity/owner/wallet session exists.
It does NOT rewrite subscription IDs, deploy programs, sign transactions, move funds, or claim that a policy is valid on-chain.

IMPORTANT: If multiple sessions exist for the same setup, the system will continue to require verification. This is intentional; do not sign again until on-chain policy and current settings are reconciled.

Install: unzip -o SYNC_SAFE_SESSION_REBIND_V33.zip && chmod +x apply_sync_session_v33.sh && ./apply_sync_session_v33.sh
