SYNC V37 — Safe execution status inspection
Fixes disabled CHECK EXECUTION STATUS button and routes blocked form submissions to status-only refresh endpoint rather than creating a new copy subscription. Shows server error messages. Does not alter delegated session, vault, on-chain program, balances or keys.
Install: unzip -o SYNC_SAFE_STATUS_V37.zip && chmod +x apply_sync_v37.sh && ./apply_sync_v37.sh
Manually restart Replit. Do not sign new policies or fund the vault until server status is confirmed.
