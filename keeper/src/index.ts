// Why: the index is only as good as its raw data. This is the keeper's first
//      step: for one slot, measure what users paid for blockspace, split into
//      priority fees and Jito tips (the two sub-indices in docs/design.md).
// How: fetches Jito's tip accounts from its block engine, loads the block for a
//      recent slot over RPC, then for each transaction adds
//        priority fee = total fee - 5,000 lamports per signature, and
//        tips = any balance increase on a Jito tip account.
//      Prints the totals in SOL. Later this splits into blocks.ts, fees.ts,
//      tips.ts, smooth.ts, backfill.ts and publish.ts.
import "dotenv/config";
import { Connection } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const LAMPORTS_PER_SOL = 1_000_000_000;
const BASE_FEE_PER_SIGNATURE = 5000;

// Jito tip accounts: fetched once, never hardcoded
async function getTipAccounts(): Promise<Set<string>> {
  const res = await fetch(
    "https://mainnet.block-engine.jito.wtf/api/v1/getTipAccounts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTipAccounts",
        params: [],
      }),
    },
  );
  const json = await res.json();
  return new Set<string>(json.result);
}

async function analyzeSlot(slot: number, tipAccounts: Set<string>) {
  const block = await connection.getBlock(slot, {
    maxSupportedTransactionVersion: 1,
    rewards: false,
  });
  if (!block) return null; // skipped or not available yet

  let priority = 0;
  let tips = 0;

  for (const tx of block.transactions) {
    const meta = tx.meta;
    if (!meta) continue;

    // priority fee = total fee paid - base fee for each signature
    priority +=
      Number(meta.fee) -
      BASE_FEE_PER_SIGNATURE * tx.transaction.signatures.length;

    // tips = positive balance change on any Jito tip account
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: meta.loadedAddresses ?? null,
    });
    for (let i = 0; i < keys.length; i++) {
      if (tipAccounts.has(keys.get(i)!.toBase58())) {
        const delta =
          Number(meta.postBalances[i]) - Number(meta.preBalances[i]);
        if (delta > 0) tips += delta;
      }
    }
  }

  return { slot, txs: block.transactions.length, priority, tips };
}

async function main() {
  const tipAccounts = await getTipAccounts();
  console.log("tip accounts loaded:", tipAccounts.size);

  const slot = Number(await connection.getSlot()) - 5;
  const r = await analyzeSlot(slot, tipAccounts);
  if (!r) return console.log("slot", slot, "has no block, try again");

  console.log({
    slot: r.slot,
    txs: r.txs,
    prioritySOL: r.priority / LAMPORTS_PER_SOL,
    tipsSOL: r.tips / LAMPORTS_PER_SOL,
  });
}
main();
