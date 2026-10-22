<!--
Why: anyone running or changing the keeper needs to know how to start it and what it measures.
How: setup steps, the commands, and a short description of each stage of the pipeline.
-->

# Keeper

Reads Solana blocks, measures priority fees and Jito tips per slot, and (later) smooths them into the index and publishes it to the `oracle` program.

## Run

```sh
cp ../.env.example .env   # fill in RPC_URL (mainnet) and KEYPAIR_PATH
npm install
npm start                 # runs src/index.ts with tsx
npm run typecheck         # what CI runs
npm run build             # compiles to dist/
```

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
