// Why: the index has to be live. This is the keeper's main loop: it keeps
//      following the chain and prints the current index value.
// How: every ~2 s it reads the newest slots (up to 4 behind the tip, skipping
//      ones already read), adds each slot's priority fees + Jito tips to a
//      rolling window of the last 100 slots, and prints the window's median
//      in SOL per slot once it has at least 10 slots. Errors are logged and
//      the loop carries on.
import {
  connection,
  getTipAccounts,
  analyzeSlot,
  sleep,
  median,
} from "./lib.js";

async function main() {
  const tipAccounts = await getTipAccounts();
  const WINDOW = 100;
  const window: number[] = [];
  let last = Number(await connection.getSlot()) - 5;
  console.log("tip accounts loaded:", tipAccounts.size);

  while (true) {
    try {
      const head = Number(await connection.getSlot()) - 5;
      for (let s = Math.max(last + 1, head - 3); s <= head; s++) {
        const r = await analyzeSlot(s, tipAccounts);
        if (r) {
          window.push(r.priority + r.tips);
          if (window.length > WINDOW) window.shift();
        }
        await sleep(250);
      }
      last = head;
      if (window.length >= 10) {
        console.log(
          new Date().toISOString(),
          "slots:",
          window.length,
          "index (median SOL/slot):",
          (median(window) / 1e9).toFixed(6),
        );
      }
    } catch (e) {
      console.error("loop error:", (e as Error).message);
      await sleep(2000);
    }
    await sleep(2000);
  }
}
main();
