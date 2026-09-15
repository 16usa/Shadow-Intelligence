Shadow Intelligence — Tokens Card Fix v2.6.3

This replaces the failed v2.6.2 patch.

It intentionally does NOT patch server.mjs by matching a specific
oneMinuteChange() text block, which caused the previous installation error.

Fixes:
- Age is visible on every token card:
  Age 12m / Age 3h / Age 2d
- 1M percent can recover from live price samples while Tokens is open.
- Tokens refresh every 65 seconds while the page is visible.
- Existing 5M / 1H / 6H / 24H / Age / MC sorting is preserved.

Important:
The first 1M value needs roughly one minute of live samples after refresh.

Install:
cd ~/workspace && rm -rf shadow-tokens-card-fix && unzip -o Shadow-Tokens-Card-Fix-v2.6.3.zip -d shadow-tokens-card-fix && bash shadow-tokens-card-fix/install.sh

No server restart is required.
