Shadow Intelligence — Tokens Age Source v2.6.5

Problem fixed
-------------
v2.6.4 could fall back to DexScreener pairCreatedAt when Pump.fun creation
lookup failed. For a graduated token, that can be the PumpSwap migration/pool
time instead of the original coin creation time.

That is why a token can incorrectly show Age 1h even though it was launched
about 4h ago.

New rule
--------
Pump.fun tokens:
- ONLY Pump.fun `created_timestamp` is accepted as token age.
- PumpSwap/Raydium pair creation time is NEVER accepted as Pump token age.
- If Pump creation time is unavailable, show Age — rather than a false age.

Non-Pump tokens:
- earliest known market/pair timestamp remains the fallback.

Install
-------
cd ~/workspace && rm -rf shadow-tokens-age-source && unzip -o Shadow-Tokens-Age-Source-v2.6.5.zip -d shadow-tokens-age-source && bash shadow-tokens-age-source/install.sh

The installer also re-checks all existing Pump tokens and replaces incorrect
cached pair/migration ages.

Restart the main Shadow/Replit app once after installation.
