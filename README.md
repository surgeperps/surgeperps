<!--
Why: the front page of the repo. Says what Surge is and where each piece lives.
How: a short overview plus a map of the folders; each folder has its own README or file headers with details.
-->

# Surge Perps

A perpetual futures market on the cost of Solana blockspace. A keeper reads every block, measures priority fees and Jito tips, and publishes an index on-chain. A perp program settles against that index, so apps can cap their blockspace bill and validators can lock in fee income.

## Layout

| Path | What it is |
| --- | --- |
| `keeper/` | TypeScript service: reads blocks, computes the fee and tip sub-indices, publishes to the oracle (steps 1-6) |
| `anchor/` | Anchor workspace: `oracle` program (steps 5-6) and `perp` program (steps 8-11), plus tests |
| `app/` | Next.js front end: public index page and the gas-bill cap tool (steps 7 and 12) |
| `scripts/` | Devnet airdrop, oracle init, one-off checks |
| `docs/` | Public design notes and the architecture diagram |
| `.github/workflows/` | CI |

## Setup

1. `cp .env.example keeper/.env` and fill in `RPC_URL` and `KEYPAIR_PATH`.
2. Keeper: see `keeper/README.md`.
3. Programs: `cd anchor && npm install && anchor build && anchor test`.
4. App: `cd app && npm install && npm run dev`.

## Security

See `SECURITY.md`.
