Shadow Linked Wallet Search Fix v1.4

Fixes:
- /api/entities now exposes every wallet linked to each entity.
- Global Search can find any linked wallet immediately, without first opening the entity detail modal.
- Entity-page search also matches all linked wallet addresses and labels.
- Regression test is isolated from wallet POST background sync, avoiding the false "database is not open" teardown race seen in v1.1-v1.3.

Install from the existing Replit workspace:
  unzip -o Shadow-Linked-Wallet-Search-Fix-v1.4.zip && bash shadow-linked-wallet-fix-v1.4/install.sh

The installer does NOT restart the server.
