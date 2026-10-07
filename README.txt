SYNC AUTH TOKEN RACE FIX V28

Exact problem found after the latest push
-----------------------------------------
The error "Delegated action link is invalid or expired" was a token race.

Old behavior:
- issueActionUrl() stored only ONE auth_token_hash in delegated_copy_sessions.
- Every /copy/execution status refresh called syncSubscription() -> snapshot().
- If authorization was still required, snapshot() called issueActionUrl() again.
- That generated a NEW token and overwrote auth_token_hash.
- The URL already opened in Safari/Phantom immediately became invalid even
  though its 30-minute expiry had not passed.

So the message looked like an expiry problem, but most of the time the token
was being invalidated by a newer background refresh.

V28:
- adds delegated_copy_action_tokens
- allows several unexpired short-lived tokens for the same subscription/action
- background polling may create a new link without killing the already-open link
- actionRow() validates against the token table first
- pre-V28 legacy token still works until its original expiry
- successful authorize/revoke clears obsolete tokens

No transaction is created by installing this patch.
No wallet signature is requested by installing this patch.
No funds are moved by installing this patch.

Install from ~/workspace:

unzip -o SYNC_AUTH_TOKEN_RACE_FIX_V28.zip && chmod +x apply_sync_auth_token_race_fix_v28.sh && ./apply_sync_auth_token_race_fix_v28.sh

Then manually restart Replit once.

After restart:
1. Return to SYNC.
2. Press AUTHORIZE to obtain a fresh link.
3. Open it.
4. The page should no longer flip to "invalid or expired" because of background polling.
5. V27 will then continue with its policy-update simulation/verification.
