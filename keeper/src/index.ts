// Why: the index has to be live. This is the keeper's main loop: it keeps
//      following the chain, keeps the two sub-indices current, and writes them
//      to the on-chain oracle so the perp always has a fresh price.
// How: every ~2 s it reads the newest mainnet slots (up to 4 behind the tip,
//      skipping ones already read) and adds each slot's priority fees (P) and
//      Jito tips (T) to two rolling windows of the last 100 slots. Once it has
//      at least 10 slots it prints the medians and, at most every
//      PUBLISH_EVERY_MS (default 10 s), publishes them with update_index
//      (publish.ts). The perp rejects an index older than 150 slots (~60 s),
//      so 10 s leaves plenty of room for a failed send. Set PUBLISH=0 to only
//      watch. Errors are logged and the loop carries on.
//      RPC budget: every loop costs 1 getSlot + up to BLOCKS_PER_LOOP getBlock
//      calls on RPC_URL (1 Helius credit each). LOOP_MS is the minimum time
//      per loop, so the worst case is (1 + BLOCKS_PER_LOOP) calls per LOOP_MS.
//      Defaults follow the chain closely; on a free plan use e.g.
//      BLOCKS_PER_LOOP=2 LOOP_MS=9000 (~29k credits/day). If PORT is set, a
//      tiny HTTP server answers /health: 200 while publishing works, 503 once
//      the last successful publish is older than 2 minutes (for uptime checks).
import * as http from "http";
import { connection, getTipAccounts, analyzeSlot, sleep, median } from "./lib.js";
import { Publisher, loadAuthority, oraclePda } from "./publish.js";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const WINDOW = num(process.env.WINDOW, 100);
const BLOCKS_PER_LOOP = num(process.env.BLOCKS_PER_LOOP, 4);
const LOOP_MS = num(process.env.LOOP_MS, 2000);
const PUBLISH = process.env.PUBLISH !== "0";
const PUBLISH_EVERY_MS = num(process.env.PUBLISH_EVERY_MS, 10000);
const STARTED = Date.now();
let lastOk = 0;

function serveHealth() {
  const port = Number(process.env.PORT);
  if (!port) return;
  http.createServer((_req, res) => {
    const ref = lastOk || STARTED; // grace period after start
    const age = Math.round((Date.now() - ref) / 1000);
    const ok = !PUBLISH || age < 120;
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, publishing: PUBLISH, secondsSinceLastPublish: lastOk ? age : null }));
  }).listen(port, () => console.log("health on port", port));
}

async function main() {
  const tipAccounts = await getTipAccounts();
  const pWin: number[] = [];
  const tWin: number[] = [];
  let last = Number(await connection.getSlot()) - 5;
  let lastPublish = 0;
  console.log("tip accounts loaded:", tipAccounts.size, `| window ${WINDOW} slots, ${BLOCKS_PER_LOOP} blocks per loop, loop ≥ ${LOOP_MS} ms`);
  serveHealth();

  const publisher = PUBLISH ? new Publisher(await loadAuthority()) : null;
  if (publisher) {
    console.log("publishing to", publisher.connection.rpcEndpoint, "oracle", (await oraclePda()).toBase58(), "as", publisher.authority.publicKey.toBase58());
  } else {
    console.log("PUBLISH=0: watching only");
  }

  while (true) {
    const loopStart = Date.now();
    try {
      const head = Number(await connection.getSlot()) - 5;
      for (let s = Math.max(last + 1, head - BLOCKS_PER_LOOP + 1); s <= head; s++) {
        const r = await analyzeSlot(s, tipAccounts);
        if (r) {
          pWin.push(r.priority);
          tWin.push(r.tips);
          if (pWin.length > WINDOW) pWin.shift();
          if (tWin.length > WINDOW) tWin.shift();
        }
        await sleep(250);
      }
      last = head;
      if (pWin.length >= 10) {
        const P = Math.round(median(pWin));
        const T = Math.round(median(tWin));
        const index = Math.floor((P * 7900 + T * 2100) / 10000);
        let note = "";
        if (publisher && Date.now() - lastPublish >= PUBLISH_EVERY_MS) {
          try {
            const sig = await publisher.publish(P, T);
            lastPublish = Date.now();
            lastOk = lastPublish;
            note = ` published ${sig.slice(0, 12)}…`;
          } catch (e) {
            note = ` publish failed: ${(e as Error).message.split("\n")[0]}`;
          }
        }
        console.log(
          new Date().toISOString(),
          `slots ${pWin.length}`,
          `P ${(P / 1e9).toFixed(6)}`,
          `T ${(T / 1e9).toFixed(6)}`,
          `index ${(index / 1e9).toFixed(6)} SOL/slot${note}`,
        );
      }
    } catch (e) {
      console.error("loop error:", (e as Error).message);
      await sleep(2000);
    }
    await sleep(Math.max(250, LOOP_MS - (Date.now() - loopStart)));
  }
}
main();
