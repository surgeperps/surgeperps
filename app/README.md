<!--
Why: anyone running or changing the front end needs to know how to start it, how it talks to the programs, and where each screen lives.
How: setup, the three routes, the data flow, and what to do after the programs change.
-->

# SurgePerps app

Next.js 16 · React 19 · Solana wallet adapter · Anchor client. Styled to match the landing page (cream, ink, one orange; Inter + JetBrains Mono).

## Run

```sh
cp .env.example .env.local   # devnet RPC + program IDs
npm install
npm run dev                  # http://localhost:3000
```

## Routes

| Route | What it is |
| --- | --- |
| `/` | Public index page: live index, P and T sub-indices, chart, method, on-chain addresses |
| `/trade` | Trading terminal: market stats, chart, order ticket, collateral, your position, market rules |
| `/hedge` | "Lock in my gas bill": monthly bill → suggested long size, payoff chart, link into `/trade` |

## How it gets data

- `components/SurgeData.tsx` loads the **Oracle** and **Market** accounts once, subscribes to changes over WebSocket, polls the slot, and rebuilds recent history from `IndexUpdated` events.
- If the oracle account isn't on the cluster yet, it runs a **demo feed** and the header shows "Demo feed". Trading is disabled in demo mode.
- `lib/math.ts` mirrors the perp program's maths (margin, PnL, funding, liquidation) so previews match what `trade()` will accept.
- `components/useTrader.ts` sends `open_position` + `deposit` + `trade` in one transaction when needed.

## After you change the programs

```sh
cd ../anchor && anchor build && cd ../app && npm run sync-idl
```

## Deploy (Vercel)

Root directory `code/app`. Set `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_ORACLE_ID`, `NEXT_PUBLIC_PERP_ID` (and optionally `NEXT_PUBLIC_INDEX_BASELINE`).
