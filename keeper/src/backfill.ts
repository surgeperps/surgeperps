// What it does, in simple words: it goes back in time and checks that the
// keeper's way of measuring fees gives the same answer as the public data.
// The pitch says Solana's daily fees rose about 6.6x in two days in January
// 2025 (DefiLlama). This script measures a quiet day and a busy day itself
// and prints its own ratio, so we can see if the keeper agrees.
//
// Why: before anyone trades on the index, we need proof that the keeper's
//      numbers match reality, and a way to rebuild past values (history).
// How: for each day in DAYS it
//        1. finds the first and last slot of that day (UTC) by binary search
//           on block times,
//        2. reads SAMPLES blocks spread evenly across the day,
//        3. averages the fees per block and multiplies by the number of slots
//           in the day to estimate the day's total.
//      It prints chain fees (base + priority, what DefiLlama counts) and Jito
//      tips separately, then the busy-day / quiet-day ratio.
//      Needs an RPC that keeps old blocks (an archive RPC); most free RPCs
//      only keep the last few days.
// Run: npm run backfill
import {
  connection,
  getTipAccounts,
  analyzeSlot,
  sleep,
  median,
} from "./lib.js";

const SAMPLES = 40;
const DAYS = ["2025-01-17", "2025-01-19"];
const DAY_SECONDS = 86_400;
const LAMPORTS_PER_SOL = 1_000_000_000;

// block time of the first produced block at or after `slot` (skipped slots have none)
async function timeOf(slot: number) {
  for (let s = slot; s < slot + 30; s++) {
    try {
      const t = await connection.getBlockTime(s);
      if (t) return { slot: s, t };
    } catch {}
    await sleep(100);
  }
  throw new Error(
    "no block time near slot " + slot + " (does your RPC keep old blocks?)",
  );
}

// first slot at or after a unix time, by binary search
async function slotAtTime(target: number) {
  let lo = 250_000_000; // early 2024, before any day we look at
  let hi = Number(await connection.getSlot());
  while (hi - lo > 50) {
    const mid = Math.floor((lo + hi) / 2);
    const { t } = await timeOf(mid);
    if (t < target) lo = mid;
    else hi = mid;
    await sleep(100);
  }
  return hi;
}

const mean = (a: number[]) =>
  a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

async function main() {
  const tips = await getTipAccounts();
  const results: {
    day: string;
    slots: number;
    n: number;
    feesPerBlockSOL: number;
    tipsPerBlockSOL: number;
    medianTotalSOL: number;
    estDayFeesSOL: number;
    estDayTipsSOL: number;
  }[] = [];

  for (const day of DAYS) {
    const start = Date.parse(day + "T00:00:00Z") / 1000;
    const s0 = await slotAtTime(start);
    const s1 = await slotAtTime(start + DAY_SECONDS);
    const slotsInDay = s1 - s0;
    console.log(day, "slots", s0, "to", s1, `(${slotsInDay})`);

    const fees: number[] = [];
    const tipTotals: number[] = [];
    const totals: number[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      const slot = s0 + Math.floor((k + 0.5) * (slotsInDay / SAMPLES));
      try {
        const r = await analyzeSlot(slot, tips);
        if (r) {
          fees.push(r.base + r.priority);
          tipTotals.push(r.tips);
          totals.push(r.priority + r.tips);
        }
      } catch (e) {
        console.error("slot", slot, (e as Error).message);
      }
      await sleep(300);
    }
    if (totals.length === 0) {
      console.error(day, "no blocks could be read, skipping");
      continue;
    }

    // skipped slots have no block, so scale by the share of slots that had one
    const feesPerBlock = mean(fees) / LAMPORTS_PER_SOL;
    const tipsPerBlock = mean(tipTotals) / LAMPORTS_PER_SOL;
    const produced = slotsInDay * (totals.length / SAMPLES);
    results.push({
      day,
      slots: slotsInDay,
      n: totals.length,
      feesPerBlockSOL: feesPerBlock,
      tipsPerBlockSOL: tipsPerBlock,
      medianTotalSOL: median(totals) / LAMPORTS_PER_SOL,
      estDayFeesSOL: feesPerBlock * produced,
      estDayTipsSOL: tipsPerBlock * produced,
    });
  }

  console.table(results);

  const [a, b] = results;
  if (!a || !b || a.estDayFeesSOL === 0) {
    console.log("need both days to compute a ratio");
    return;
  }
  console.log(
    `chain fees ratio ${b.day} / ${a.day}:`,
    (b.estDayFeesSOL / a.estDayFeesSOL).toFixed(2),
  );
  console.log("DefiLlama chain fees ratio for the same days: about 6.6");
  if (a.estDayTipsSOL > 0) {
    console.log(
      `tips ratio ${b.day} / ${a.day}:`,
      (b.estDayTipsSOL / a.estDayTipsSOL).toFixed(2),
    );
  }
}
main();
