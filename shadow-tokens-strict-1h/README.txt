Shadow Intelligence — Tokens Strict 1H v2.5.7

This patch makes every percentage on the Tokens page mean exactly:
PRICE CHANGE OVER THE LAST 1 HOUR.

Changes:
- No fallback from 1H to 24H or 5m.
- UI explicitly shows "1H +36.1%" / "1H -4.2%".
- If DexScreener has no 1H value, UI shows "1H —".
- Current token 1H values are refreshed in batched market calls.
- Server cache is 60 seconds to avoid unnecessary repeated requests.

Install:
cd ~/workspace && rm -rf shadow-tokens-strict-1h && unzip -o Shadow-Tokens-Strict-1H-v2.5.7.zip -d shadow-tokens-strict-1h && bash shadow-tokens-strict-1h/install.sh

Then restart the main Shadow/Replit app once and refresh Safari.

Rollback:
cd ~/workspace && bash shadow-tokens-strict-1h/rollback.sh
