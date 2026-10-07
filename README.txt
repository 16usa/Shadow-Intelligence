SYNC POLICY UPDATE FIX V27

Problem:
The authorization transaction confirmed, but the deployed policy still differed
from the current copy settings in:
- max_trade_lamports
- daily_cap_lamports

V27 fixes the policy-update builder itself.

Before Phantom is asked to sign an EXISTING policy update, the backend:
1. builds a candidate UpdatePolicy instruction,
2. simulates it against the deployed mainnet program,
3. reads the simulated post-policy account,
4. verifies it matches the current copy settings exactly,
5. tests both the standard and alternate order of the two u64 limit fields,
6. returns only the transaction that simulation proves is correct.

If neither candidate matches, V27 fails closed:
- no wallet signature requested
- no transaction broadcast
- no funds moved

It does not change vault addresses, keys, TP/SL logic, balances, or delegated funds.

Install from ~/workspace:

unzip -o SYNC_POLICY_UPDATE_FIX_V27.zip && chmod +x apply_sync_policy_update_fix_v27.sh && ./apply_sync_policy_update_fix_v27.sh

Then manually restart Replit once.

After restart:
- open SYNC
- press AUTHORIZE
- sign once
- wait for confirmation
- GO TO COPY TRADING should appear only after the resulting on-chain policy matches current settings.
