SYNC WALLET DOUBLE PROMPT FIX V32B

Why V32 failed
--------------
V32 used one large exact-text anchor for the whole sign() function.
Your current workspace has a slightly different sign() body, so the installer
correctly stopped and restored the originals.

V32B uses small semantic anchors instead.

What V32B changes
-----------------
Old behavior on every tap:
  wallet.connect()
  signAndSendTransaction()

New behavior:
  if wallet is NOT connected -> connect once
  signAndSendTransaction()

So an already-connected Phantom/Solflare wallet should show only the transaction
approval sheet, not a redundant connection sheet immediately before it.

It also adds an in-flight guard when the current sign() function shape supports
it, preventing a fast double tap from starting another request.

Install from ~/workspace:

unzip -o SYNC_WALLET_DOUBLE_PROMPT_FIX_V32B.zip && chmod +x apply_sync_wallet_double_prompt_fix_v32b.sh && ./apply_sync_wallet_double_prompt_fix_v32b.sh

Then manually restart Replit once.

This patch changes only:
  public/execution-authorize.js
  public/execution-authorize.html

No backend/on-chain/vault/trading logic is changed.
