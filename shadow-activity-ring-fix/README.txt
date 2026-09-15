Shadow Intelligence — Activity Ring Fix v2.7.3

Goal:
Remove only the persistent green circular outline around an avatar while that
entity is active.

Kept intact:
- activity detection
- si-entity-beacon DOM
- buy/sell beacon state
- beacon timers
- persisted beacons
- graph behavior
- avatar movement/clicks
- light/dark themes

The patch observes `.si-entity-beacon`, keeps it mounted, and neutralizes only
the ring/outline styling on the active avatar. When the beacon expires, normal
avatar styling is restored.

Install:
cd ~/workspace && rm -rf shadow-activity-ring-fix && unzip -o Shadow-Activity-Ring-Fix-v2.7.3.zip -d shadow-activity-ring-fix && bash shadow-activity-ring-fix/install.sh

No server restart required. Refresh Safari.
