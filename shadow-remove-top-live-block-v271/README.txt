Shadow Intelligence — Remove Top Live Block v2.7.1

v2.7.0 targeted the wrong 'beacon':
those app.js beacons are the tiny indicators attached to graph entities.

v2.7.1 removes the actual top-center BUY/SELL card.

It removes:
- si-top-movers.js / si-top-movers.css if present
- old 24H/1H mover/live-card references
- old live-beacon-card assets if present
- stale top-center trade pill if an old cached implementation recreates it

It keeps:
- graph/avatar entity beacons
- the bell button
- graph/avatar cluster
- bottom navigation
- Tokens page

Install:
cd ~/workspace && rm -rf shadow-remove-top-live-block-v271 && unzip -o Shadow-Remove-Top-Live-Block-v2.7.1.zip -d shadow-remove-top-live-block-v271 && bash shadow-remove-top-live-block-v271/install.sh

No server restart required. Refresh Safari.
