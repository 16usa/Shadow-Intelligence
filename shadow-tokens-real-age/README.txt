Shadow Intelligence — Tokens Real Age v2.6.4

This replaces v2.6.3.

AGE
- For Pump.fun tokens, age comes from Pump.fun's own created_timestamp.
- It is NOT when Shadow discovered the token.
- Created 1 hour ago -> Age 1h.
- Created 2 days ago -> Age 2d.
- If Pump creation data is unavailable, earliest known market/pair creation
  is used as the fallback. Shadow local created_at is never used.

Every card shows:
  source · Age 2d · MC $123K

SORTING
1M / 5M / 1H / 6H / 24H:
- display and sort by the selected price-change period.

Age:
- youngest token first.
- the card still shows its 1H price change on the right.

MC:
- highest market cap first.
- the card still shows its 1H price change on the right.

The failed v2.6.3 overlay is removed to prevent conflicts.

Install:
cd ~/workspace && rm -rf shadow-tokens-real-age && unzip -o Shadow-Tokens-Real-Age-v2.6.4.zip -d shadow-tokens-real-age && bash shadow-tokens-real-age/install.sh

Then restart the main Shadow/Replit app once and refresh Safari.
