Shadow Intelligence — Tokens Clean Percent v2.5.9

Small UI cleanup:
- Removes the visible "1H" prefix from every token percentage.
- Keeps strict 1-hour market data logic exactly as-is.
- Keeps Top 1H sorting exactly as-is.
- Keeps Newest and MC sorting exactly as-is.
- Missing value shows "—".

Example:
Before: 1H +503.0%
After:  +503.0%

Install:
cd ~/workspace && rm -rf shadow-tokens-clean-percent && unzip -o Shadow-Tokens-Clean-Percent-v2.5.9.zip -d shadow-tokens-clean-percent && bash shadow-tokens-clean-percent/install.sh

No server restart required.
