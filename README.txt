SYNC V35 - guarded orphaned delegated-session rebind

Fixes: existing policy cannot be linked to a recreated Copy Setup, leaving activation pending.
Only rebinds if old subscription no longer exists, exactly one session exists for user/entity, owner and funding-wallet ID match, session is not revoked, program ID matches, and policy account is verified on-chain.
Does NOT create a new vault, sign a transaction, move funds, or deploy a program.
When any condition fails, existing fail-closed session_rebind_required state remains.

Install from project root:
unzip -o SYNC_SAFE_ORPHAN_REBIND_V35.zip && chmod +x apply_sync_v35.sh && ./apply_sync_v35.sh

Manual restart required.
