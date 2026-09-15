Shadow Intelligence — Remove Top Live Block v2.7.0

Removes only the small live activity / beacon card at the top-center of the
overview page (the card that shows an account, age, BUY/SELL, token and %).

It does NOT target:
- the bell button on the right
- the graph / avatar cluster
- the bottom navigation
- Tokens page sorting

The installer:
1. backs up affected public files;
2. removes dedicated live/beacon JS/CSS assets and their index references;
3. removes marker-wrapped inline live/beacon code if an older patch inserted it.

Install:
cd ~/workspace && rm -rf shadow-remove-top-live-block && unzip -o Shadow-Remove-Top-Live-Block-v2.7.0.zip -d shadow-remove-top-live-block && bash shadow-remove-top-live-block/install.sh

No server restart required. Refresh Safari.
