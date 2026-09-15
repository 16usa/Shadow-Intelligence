Shadow Intelligence — Top 24H Movers v2.5.0

Adds an X-inspired horizontal market strip to the Overview/Map page.

Behavior
- Shows up to 12 strongest positive movers among Shadow's recently tracked tokens.
- Uses live DexScreener 24-hour percentage data.
- Filters out tokens with less than $1,000 liquidity.
- Uses existing Shadow market_snapshots for the real 24-hour sparkline.
- If history is not yet deep enough, the graph uses only the mathematically
  implied 24h-open and the live current price (no invented fake wavy path).
- Cards swipe horizontally on iPhone and use scroll snap.
- Tap a card to open the existing Shadow token detail.
- Market endpoint is server-cached for 90 seconds.
- The UI refreshes every 2 minutes.
- Existing Shadow CSS and the X-style 0.5px hairline patch are preserved.

Install
1. Upload Shadow-Top-24H-Movers-v2.5.0.zip to ~/workspace
2. Run:
   cd ~/workspace && rm -rf shadow-top-24h && unzip -o Shadow-Top-24H-Movers-v2.5.0.zip -d shadow-top-24h && bash shadow-top-24h/install.sh
3. Restart the Shadow/Replit app once.

Rollback
   cd ~/workspace && bash shadow-top-24h/rollback.sh
Then restart the app once.
