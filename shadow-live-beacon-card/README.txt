Shadow Intelligence — Live Activity Beacon Card v2.5.6

Replaces the market-mover card next to the bell with the latest real Live Activity event.

Card shows:
- green live dot
- Entity / X handle
- BUY / SELL / SWAP
- token ticker
- event percentage when available
- relative time (now, 9m, 1h)

Behavior:
- same 50px row as the bell
- refreshes every 15 seconds
- new event slides in from the bell/right side
- tap opens Live Activity
- uses the existing /api/feed source, so there is one source of truth
- no backend changes
- no restart required

Install:
cd ~/workspace && rm -rf shadow-live-beacon-card && unzip -o Shadow-Live-Activity-Beacon-v2.5.6.zip -d shadow-live-beacon-card && bash shadow-live-beacon-card/install.sh
