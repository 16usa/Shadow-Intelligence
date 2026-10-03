Shadow Linked Wallet Search Fix v1.1

Fixes:
1. /api/entities now exposes every linked wallet, not only the first/main wallet.
2. Entity-list search matches any linked wallet address.
3. Global search indexes all linked wallets immediately, without requiring entity details to be opened first.
4. Fixes the smoke-test race shown as: Error: database is not open.
   Short-lived test servers no longer launch detached initial wallet sync after the test has ended.
5. Production behavior remains unchanged: the real startServer uses autoMonitor=true, so initial background wallet sync still runs.

Install from the existing Replit workspace:
  unzip -o Shadow-Linked-Wallet-Search-Fix-v1.1.zip && bash shadow-linked-wallet-fix-v1.1/install.sh

The installer creates a backup, applies the patch, runs git diff --check and npm test, and restores the original files automatically if anything fails.
It does NOT restart the server.
