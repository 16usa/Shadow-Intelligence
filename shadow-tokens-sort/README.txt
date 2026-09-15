Shadow Intelligence — Tokens Sort v2.5.8

Adds a compact sort control to the Tokens page:

Top 1H | Newest | MC

Rules:
- Top 1H: strict 1-hour percentage, highest first.
- Newest: newest observed token first.
- MC: highest market cap first.
- No alphabetical sort.
- Top 1H is the default.
- Selected sort is remembered in the browser.
- Sorting is client-side, so switching is instant.
- Keeps the existing strict 1H labels and data.
- No server restart required.

Install:
cd ~/workspace && rm -rf shadow-tokens-sort && unzip -o Shadow-Tokens-Sort-v2.5.8.zip -d shadow-tokens-sort && bash shadow-tokens-sort/install.sh

Rollback:
cd ~/workspace && bash shadow-tokens-sort/rollback.sh
