Shadow Tokens Joint Rank v2.6.9

Why v2.6.8 looked broken
-------------------------
v2.6.8 used:
1. price change
2. Age only if price was tied
3. MC only if price AND Age were tied

Since token percentages are usually different, Age and MC almost never changed
the visible order.

v2.6.9
------
All three criteria now work together for every token:

- selected time-period price rank = 33.3%
- Age rank = 33.3%
- MC rank = 33.3%

Controls:
1M | 5M | 1H | 6H | 24H | Age ↓/↑ | MC ↓/↑

Age ↓ = younger is better in the combined rank.
Age ↑ = older is better.

MC ↓ = larger market cap is better.
MC ↑ = smaller market cap is better.

Changing the time period changes the price component while Age and MC stay
active.

Install:
cd ~/workspace && rm -rf shadow-tokens-joint-rank && unzip -o Shadow-Tokens-Joint-Rank-v2.6.9.zip -d shadow-tokens-joint-rank && bash shadow-tokens-joint-rank/install.sh

No server restart required.
