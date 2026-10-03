Shadow Intelligence — Linked Wallet Search Fix v1.0

Fixes:
- /api/entities now returns every linked wallet, not only mainWalletAddress.
- Global Search finds Entity by any linked wallet address.
- Global Search shows each linked wallet as an actual Wallet result even before Entity detail is opened.
- Entities page filtering matches any linked wallet address or wallet label.
- Main Wallet remains the first wallet and existing UI behavior is preserved.
- Adds a smoke test for multi-wallet entity payloads.

Install in the existing Replit Shadow workspace:
1. Upload this ZIP and extract it.
2. Run: bash shadow-linked-wallet-fix/install.sh

The installer:
- creates a timestamped backup,
- patches server.mjs, public/app.js, tests/smoke.test.mjs,
- runs git diff --check and npm test,
- commits and pushes to origin/main,
- DOES NOT restart the server.

If tests fail, the installer restores the three original files automatically.
