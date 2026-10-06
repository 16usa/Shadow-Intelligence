# Shadow Public Copy Room v1

Adds a separate `/sync` mini-site on top of the existing Shadow Intelligence copy-trading system.

## What it adds
- One configured leader Entity / Main Wallet
- Public active-wallet counter
- Wallet-first Phantom / Solflare connection
- Buy amount, max position and daily cap shown in USD and converted to SOL on activation
- Pump.fun MC min/max filters through the existing Shadow subscription API
- Follow buys / follow sells
- Existing delegated Execution Wallet authorization flow
- Live leader activity feed
- Owner-only leader selector on the same page
- No duplicated copy engine
- No automatic restart

## Install from Replit Shell
```bash
unzip -o shadow-public-copy-room-v1.zip
bash shadow-public-copy-room-v1/install.sh
```

Then restart manually with Replit Stop -> Run.

Open:
`/sync`

When logged in as owner, scroll to **OWNER ONLY → Room setup**, select the Entity whose Main Wallet should be the leader, and save.

## Git push
```bash
git add server.mjs public/sync.html public/sync.css public/sync.js
git commit -m "Add public copy trading room"
git push origin main
```
