# Shadow Intelligence — Live Intelligence v0.4

A Replit-ready Solana/Pump.fun intelligence application with entity profiles, multi-wallet tracking, live activity, evidence, optional X monitoring, community chat, private messages, owner controls, and a copy-trading adapter.

## What changed in v0.4

This release replaces the original demo intelligence feed with a real data pipeline while preserving existing users, real entities, wallets, avatars, chat, evidence, and settings.

### Live wallet monitoring

- Validates Solana public keys before tracking.
- Polls every tracked wallet automatically (default: every 60 seconds).
- Backfills recent wallet activity on the first scan.
- Uses Helius Enhanced Transactions automatically when `HELIUS_API_KEY` is present.
- Otherwise falls back to standard Solana JSON-RPC (`getSignaturesForAddress` + `getTransaction`).
- Stores normalized wallet activity in SQLite and deduplicates it by transaction signature/mint/type.
- `Sync now` is available from Entity Detail and Wallets for owner/admin accounts.

### Pump.fun / PumpSwap detection

The parser recognizes the official Pump bonding-curve program and PumpSwap AMM program:

- Pump: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- PumpSwap: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

Tracked token metadata and current market context are enriched through DexScreener. Token market data is cached briefly in SQLite so a wallet with repeated activity does not hammer the external API.

### X monitoring

If `X_BEARER_TOKEN` is configured, Shadow Intelligence:

- resolves the tracked X profile by handle;
- polls new posts from that user;
- stores posts and source URLs;
- detects Solana mint addresses and `$SYMBOL` mentions in post text;
- correlates a post with already observed wallet activity for the same token.

Without an X API token, wallet monitoring remains fully active. Users can still upload X posts/screenshots as Evidence and specify the post time + token mint/symbol for correlation.

### Evidence-based risk

Normal wallet buys/sells do **not** automatically make an entity high risk. Risk is increased only for stronger observable correlations such as:

`wallet buy -> X post -> wallet sell`

The resulting incident is explicitly described as an observed on-chain/social correlation, not a legal determination of wrongdoing.

### Demo cleanup / migration safety

On the first v0.4 start, the migration removes only the known built-in demo IDs (`moondev`, `degensage`, demo tokens/incidents/groups). Random/user-created records are preserved. The migration test includes a real-style `sling` entity and confirms that its wallet survives intact.

## Replit installation

Upload the v0.4 patch ZIP to the **existing Shadow Intelligence Replit project**. Do not create a new database and do not delete the current `shadow-intelligence.db`.

Use this Replit Agent instruction:

```text
Apply the attached Shadow Intelligence Live Intelligence v0.4 patch to the existing project.
Replace/add only the files contained in the patch.
DO NOT delete, reset, rename, recreate, or overwrite the existing shadow-intelligence.db database.
DO NOT remove existing users, the sling entity, its wallet, avatars, evidence, chat, messages, owner role, or Replit secrets.
Keep the existing npm start workflow and port 3000.

After applying, run:
node --check server.mjs
node --check public/app.js
node --check src/live-intelligence.mjs
npm test

Expected tests: 6 passed, 0 failed.
Then restart the existing npm start application.
Do not redesign the UI and do not change unrelated files.
```

## Replit Secrets

### Works immediately (no paid provider required)

The code falls back to Solana public mainnet RPC when no provider is configured. This is useful to verify the pipeline, but public RPC can rate-limit history-heavy monitoring.

### Recommended for stable wallet monitoring

Set one of:

```text
SOLANA_RPC_URL=https://your-solana-rpc.example
```

or:

```text
HELIUS_API_KEY=your_helius_key
```

When `HELIUS_API_KEY` is present, the wallet reader automatically uses Helius' parsed address transaction feed and its RPC endpoint for health/status.

### Automatic X posts

```text
X_BEARER_TOKEN=your_x_api_bearer_token
```

This is optional. It is never exposed to the browser.

### Existing copy-trading engine

```text
COPY_ENGINE_URL=https://your-existing-engine.example
COPY_ENGINE_TOKEN=your_server_to_server_token
```

The v0.4 UI can now put multiple tracked wallets into a Copy Group. If the external engine is not configured, group state is stored and monitoring works, but actual trade execution remains simulation mode. This is intentional: the existing trading engine cannot be safely reproduced without its actual source/API contract.

## Owner workflow for the first real entity

For `sling`:

1. Keep the existing Entity and confirmed wallet; do not recreate them.
2. Open **Entities -> sling**.
3. Tap **Sync wallet + X now**.
4. The first scan loads recent wallet transactions. New scans use the saved latest signature and process only newer activity.
5. Open **Live Feed** to see normalized buys/sells/receives/sends.
6. Open **Tokens** for detected token market context and Pump.fun/PumpSwap labels.
7. For a relevant X post, use **Evidence -> Upload Evidence**, select `sling`, choose `X post`, add the original post URL, exact post time, and token mint if known.
8. If `X_BEARER_TOKEN` is configured, the app also imports new posts automatically.

## Owner Settings

The owner page now includes:

- Live wallet monitoring toggle
- Poll interval (30–3600 seconds)
- First-scan history depth (5–100 transactions)
- X monitoring toggle
- Live provider status

Default live poll: 60 seconds.

## New live data tables

- `wallet_activity` — normalized on-chain wallet activity
- `social_posts` — automatic X posts and evidence-backed social signals
- `market_snapshots` — token market snapshots for future outcome analysis

Existing schema is migrated in place using additive columns/tables.

## Important current boundary

v0.4 makes **wallet monitoring, Pump.fun/PumpSwap detection, token enrichment, live feed, evidence correlation, X ingestion (with API token), and multi-wallet Copy Groups real**.

It does **not** invent follower-loss dollar amounts when there is no defensible source for them, and it does not execute real copy trades unless the existing copy-trading engine is connected through its server adapter. Those values/actions should come from real data rather than demo assumptions.
