Shadow Linked Wallet 3D Fix v1.5

What it fixes
- Keeps the v1.4 linked-wallet search behavior.
- Entity detail no longer relies only on d.wallets for the 3D network.
- Merges entity.linkedWallets, d.linkedWallets (if present), and d.wallets.
- Deduplicates wallets by address/id while keeping detail data as the freshest override.
- Passes the complete linked-wallet array into the existing ShadowGraph model.
- Existing token/P&L aggregation and visual design are not changed.

Install from the existing Replit workspace
  unzip -o Shadow-Linked-Wallet-3D-Fix-v1.5.zip && bash shadow-linked-wallet-3d-fix-v1.5/install.sh

The installer creates a backup, runs syntax checks + npm test, and does NOT restart the server.
Restart manually in Replit after installation.

After verification, push the combined v1.4 + v1.5 changes
  git add server.mjs public/app.js tests/smoke.test.mjs && git commit -m "Fix linked wallets in search and 3D entity graph" && git push
