Shadow Linked Wallet Search Fix v1.3

Fixes:
- Global Search can find every wallet linked to an entity, not only Main Wallet.
- /api/entities returns linkedWallets + walletAddresses for immediate search indexing.
- Entity list filtering also recognizes any linked wallet address/label.
- Test servers no longer schedule an initial wallet sync that can outlive SQLite teardown.
- Production behavior is unchanged: the real startServer(autoMonitor=true) still schedules initial wallet sync.

Install from the existing Replit workspace (no cd required):
  unzip -o Shadow-Linked-Wallet-Search-Fix-v1.3.zip && bash shadow-linked-wallet-fix-v1.3/install.sh

The installer creates a backup, performs syntax checks, runs npm test, and automatically restores the original files if anything fails. It does NOT restart the server.
