Shadow Intelligence — Tokens Age + Percent Fix v2.6.2

Fixes the two issues visible after v2.6.1:

1. Age is now visible on every token card:
   Age 8m
   Age 3h
   Age 2d

2. 1M percentages no longer stay stuck at "—".
   While the Tokens page is open, Shadow refreshes market data every 65 seconds.
   The first real 1M percentage appears after enough minute history exists.

Important:
- 1M never uses an old stale snapshot.
- 5M / 1H / 6H / 24H remain strict.
- Age sorting remains youngest token first.

Install:
cd ~/workspace && rm -rf shadow-tokens-age-percent-fix && unzip -o Shadow-Tokens-Age-Percent-Fix-v2.6.2.zip -d shadow-tokens-age-percent-fix && bash shadow-tokens-age-percent-fix/install.sh

Then restart the main Shadow/Replit app once.
