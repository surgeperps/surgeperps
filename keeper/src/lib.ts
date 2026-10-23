// Why: the measuring code (RPC connection, tip accounts, per-slot fee and tip
//      totals) is shared by the live loop and later by backfill, so it lives
//      in one place.
// How: getTipAccounts() asks Jito's block engine for its tip accounts.
//      analyzeSlot() loads one block and adds, per transaction,
//        priority fee = total fee - 5,000 lamports per signature, and
//        tips = any balance increase on a Jito tip account.
//      median() and sleep() are small helpers.
import "dotenv/config";
import { Connection } from "@solana/web3.js";

export const connection = new Connection(process.env.RPC_URL!, "confirmed");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const BASE_FEE_PER_SIGNATURE = 5000;

export async function getTipAccounts(): Promise<Set<string>> {
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

export async function analyzeSlot(slot: number, tipAccounts: Set<string>) {
  const block = await connection.getBlock(slot, {
    maxSupportedTransactionVersion: 1,
    rewards: false,
  });
  if (!block) return null;

  let priority = 0;
  let tips = 0;
  for (const tx of block.transactions) {
    const meta = tx.meta;
    if (!meta) continue;
    priority +=
      Number(meta.fee) -
      BASE_FEE_PER_SIGNATURE * tx.transaction.signatures.length;
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: meta.loadedAddresses ?? null,
    });
    for (let i = 0; i < keys.length; i++) {
      if (tipAccounts.has(keys.get(i)!.toBase58())) {
        const d = Number(meta.postBalances[i]) - Number(meta.preBalances[i]);
        if (d > 0) tips += d;
      }
    }
  }
  return { slot, txs: block.transactions.length, priority, tips };
}
