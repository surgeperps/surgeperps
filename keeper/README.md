<!--
Why: anyone running or changing the keeper needs to know how to start it and what it measures.
How: setup steps, the commands, and a short description of each stage of the pipeline.
-->

# Keeper

Reads mainnet Solana blocks, measures priority fees (P) and Jito tips (T) per slot, keeps a rolling median of each over 100 slots, and publishes P and T to the `oracle` program every 10 s (the oracle combines them 79/21 on-chain).

## Run

```sh
cp .env.example .env      # fill in RPC_URL (mainnet) and KEYPAIR_PATH
npm install
npm start                 # follow mainnet, publish to the oracle on PUBLISH_RPC_URL (devnet by default)
PUBLISH=0 npm start       # watch only, no transactions
npm run set-authority     # hand the oracle to another key (see below)
npm run typecheck         # what CI runs
npm run build             # compiles to dist/
```

## Run it on a server (24/7)

The perp refuses trades when the index is older than 150 slots (~60 s), so the keeper must run all the time. The `Dockerfile` here works on any host (Railway, Render, Fly, a VPS).

1. **Separate keeper key** (once). The deploy wallet can upgrade both programs; keep it off servers.
   ```sh
   solana-keygen new -o ~/surge-keeper.json            # never commit it
   solana transfer -u d $(solana-keygen pubkey ~/surge-keeper.json) 1 --allow-unfunded-recipient
   NEW_AUTHORITY=$(solana-keygen pubkey ~/surge-keeper.json) DRY_RUN=1 npm run set-authority   # check
   NEW_AUTHORITY=$(solana-keygen pubkey ~/surge-keeper.json) npm run set-authority             # send
   ```
2. **Create the service** from the GitHub repo, root directory `keeper`. The host builds the `Dockerfile`.
3. **Env vars** (host dashboard, never in git):

   | Name | Value |
   | --- | --- |
   | `RPC_URL` | Helius **mainnet** URL (reads blocks) |
   | `PUBLISH_RPC_URL` | `https://api.devnet.solana.com` (free; no Helius credits) |
   | `KEYPAIR_JSON` | contents of `~/surge-keeper.json` (the `[..]` array) |
   | `BLOCKS_PER_LOOP` | `2` |
   | `LOOP_MS` | `9000` |
   | `PUBLISH_EVERY_MS` | `8000` (publish every loop, ~9 s) |
   | `PORT` | `8080` (enables `/health`) |

4. **Check**: logs show `published …` every ~9 s; the site shows LIVE; `/health` returns 200 (503 if no publish for 2 min; point an uptime monitor at it).

**Credits.** Each loop costs 1 `getSlot` + up to `BLOCKS_PER_LOOP` `getBlock` (1 Helius credit each). With the settings above, measured locally: ~0.35 calls/s, about **30k credits/day, ~0.9M per 30 days**, which fits the free 1M/month plan with a little room for the website. Publishing goes to public devnet, so it costs devnet SOL (~0.05/day), not credits. Without these settings the keeper follows the chain more closely and can use 3-4× more.

## What it does now

`src/index.ts` analyses one recent slot:

- **Priority fee** = transaction fee − 5,000 lamports × signatures.
- **Jito tips** = positive balance change on any of Jito's tip accounts (fetched from the block engine, not hardcoded).

`images/` has screenshots of example output.

## Planned split (steps 1-6)

| File | Job |
| --- | --- |
| `blocks.ts` | Fetch blocks; mark skipped slots and non-Jito leaders |
| `fees.ts` | Priority-fee sub-index |
| `tips.ts` | Jito-tip sub-index |
| `smooth.ts` | Median across leaders and time smoothing |
| `backfill.ts` | Rebuild history for past slots |
| `publish.ts` | Write the combined index to the oracle program |
