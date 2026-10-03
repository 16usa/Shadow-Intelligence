Shadow Linked Wallet Search Fix v1.2

Fixes:
- Global Search finds every wallet linked to an entity, not only a wallet already loaded into detail cache.
- Entities-page search also matches every linked wallet address/label.
- /api/entities exposes the complete linked wallet list while preserving mainWalletAddress.
- Short-lived smoke-test servers no longer schedule detached wallet sync work after DB shutdown.
- Adds a two-wallet regression test.

Install from the existing Replit project workspace root:

unzip -o Shadow-Linked-Wallet-Search-Fix-v1.2.zip && bash shadow-linked-wallet-fix-v1.2/install.sh

The installer does NOT restart the server. If any syntax check or test fails, it restores the original files automatically.

After SUCCESS, push manually if desired:

git add server.mjs public/app.js tests/smoke.test.mjs
git commit -m "Fix linked wallet global search"
git push origin main
