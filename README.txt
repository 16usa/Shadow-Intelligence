SYNC VAULT HEADER LIVE V24B

V24 stopped safely because it depended on one exact CSS <link> in sync.html.
Your current sync.html uses a different layout, so no files were changed.

V24B does not edit sync.html at all.
It:
- injects the vault amount into the header from sync.js
- appends styling directly to public/sync.css
- refreshes the vault amount about every 1 second
- refreshes immediately when the page becomes visible again

Displayed value:
- current free WSOL inside the delegated vault
- BUY lowers it
- SELL raises it
- separate 0.02 SOL network reserve is NOT included

Install from ~/workspace:

unzip -o SYNC_VAULT_HEADER_LIVE_V24B.zip && chmod +x apply_sync_vault_header_live_v24b.sh && ./apply_sync_vault_header_live_v24b.sh

Then refresh the SYNC page. Restart is not required.
