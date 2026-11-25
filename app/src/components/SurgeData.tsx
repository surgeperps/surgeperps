"use client";
// Why: the index page, trade page and hedge page all need the same live data
//      (oracle, market, current slot, index history). Fetching it once and
//      sharing it avoids three sets of RPC subscriptions.
// How: on load, fetches the Oracle and Market accounts. If they exist it
//      subscribes to changes over WebSocket, polls the slot every 2 s, and
//      rebuilds recent history from IndexUpdated events in the oracle's
//      transaction logs. If the oracle isn't deployed on this cluster yet, it
//      runs a clearly labelled demo feed so the UI can still be built and shown.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { EventParser } from "@coral-xyz/anchor";
import { MARKET_PDA, ORACLE_PDA, oracleProgram, perpProgram } from "@/lib/programs";
import { INDEX_BASELINE } from "@/lib/config";
import { toBig, type MarketState } from "@/lib/math";

export type OracleState = {
  authority: string;
  priority: bigint;
  tips: bigint;
  index: bigint;
  weightBps: number;
  lastUpdateSlot: bigint;
  lastUpdateTs: number;
};
export type IndexPoint = { t: number; index: number; priority: number; tips: number };
export type Mode = "loading" | "live" | "demo";

type Ctx = {
  mode: Mode;
  oracle: OracleState | null;
  market: MarketState | null;
  slot: bigint;
  history: IndexPoint[];
  error: string | null;
  refreshMarket: () => Promise<void>;
};
const SurgeCtx = createContext<Ctx | null>(null);
export const useSurge = () => {
  const c = useContext(SurgeCtx);
  if (!c) throw new Error("useSurge outside <SurgeData>");
  return c;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const decodeOracle = (a: any): OracleState => ({
  authority: a.authority.toBase58(),
  priority: toBig(a.priorityIndex),
  tips: toBig(a.tipIndex),
  index: toBig(a.index),
  weightBps: Number(a.priorityWeightBps),
  lastUpdateSlot: toBig(a.lastUpdateSlot),
  lastUpdateTs: Number(a.lastUpdateTs),
});
const decodeMarket = (a: any): MarketState => ({
  params: {
    initialMarginBps: Number(a.params.initialMarginBps),
    maintenanceMarginBps: Number(a.params.maintenanceMarginBps),
    liquidationFeeBps: Number(a.params.liquidationFeeBps),
    takerFeeBps: Number(a.params.takerFeeBps),
    maxFundingBpsPerDay: Number(a.params.maxFundingBpsPerDay),
    maxPositionSize: toBig(a.params.maxPositionSize),
    maxSkew: toBig(a.params.maxSkew),
    maxStalenessSlots: toBig(a.params.maxStalenessSlots),
  },
  lpBalance: toBig(a.lpBalance),
  longOi: toBig(a.longOi),
  shortOi: toBig(a.shortOi),
  cumulativeFunding: toBig(a.cumulativeFunding),
  lastFundingSlot: toBig(a.lastFundingSlot),
});

const point = (o: OracleState, t = Date.now()): IndexPoint => ({ t, index: Number(o.index), priority: Number(o.priority), tips: Number(o.tips) });

// ---------- demo feed: used only when the oracle account isn't on this cluster ----------
const DEMO_MARKET: MarketState = {
  params: { initialMarginBps: 5000, maintenanceMarginBps: 2500, liquidationFeeBps: 500, takerFeeBps: 10, maxFundingBpsPerDay: 100, maxPositionSize: 5_000_000_000n, maxSkew: 20_000_000_000n, maxStalenessSlots: 150n },
  lpBalance: 2_000_000_000n, longOi: 1_240_000_000n, shortOi: 760_000_000n, cumulativeFunding: 0n, lastFundingSlot: 0n,
};
function demoOracle(i: number, slot: bigint): OracleState {
  const base = Number(INDEX_BASELINE);
  const wave = 1 + 0.07 * Math.sin(i / 7) + 0.04 * Math.sin(i / 2.3) + 0.02 * Math.sin(i * 1.7);
  const spike = 1 + 2.6 * Math.exp(-Math.pow(((i % 240) - 200) / 6, 2));
  const index = Math.round(base * wave * spike);
  const priority = Math.round(index * 0.82);
  const tips = Math.round((index - 0.79 * priority) / 0.21);
  return { authority: "demo", priority: BigInt(priority), tips: BigInt(tips), index: BigInt(index), weightBps: 7900, lastUpdateSlot: slot - 3n, lastUpdateTs: Math.floor(Date.now() / 1000) };
}

export function SurgeData({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const [mode, setMode] = useState<Mode>("loading");
  const [oracle, setOracle] = useState<OracleState | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [slot, setSlot] = useState<bigint>(0n);
  const [history, setHistory] = useState<IndexPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const oProg = useMemo(() => oracleProgram(connection), [connection]);
  const pProg = useMemo(() => perpProgram(connection), [connection]);
  const lastSig = useRef<string>("");

  const refreshMarket = async () => {
    try {
      const m = await pProg.account.market.fetchNullable(MARKET_PDA);
      setMarket(m ? decodeMarket(m) : null);
    } catch (e) { setError(String(e)); }
  };

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setInterval>[] = [];
    const subs: number[] = [];

    (async () => {
      let o: any = null;
      try { o = await oProg.account.oracle.fetchNullable(ORACLE_PDA); }
      catch (e) { setError("Couldn't reach the RPC: " + String((e as Error).message ?? e)); }
      if (cancelled) return;

      if (!o) {
        // demo mode
        setMode("demo");
        setMarket(DEMO_MARKET);
        let i = 0, s = 300_000_000n;
        const seed: IndexPoint[] = [];
        for (; i < 90; i++) seed.push(point(demoOracle(i, s), Date.now() - (90 - i) * 4000));
        setHistory(seed);
        const tick = () => {
          s += 10n; i += 1;
          const d = demoOracle(i, s);
          setSlot(s); setOracle(d);
          setHistory((h) => [...h.slice(-299), point(d)]);
        };
        tick();
        timers.push(setInterval(tick, 4000));
        return;
      }

      setMode("live");
      const first = decodeOracle(o);
      setOracle(first);
      setHistory([point(first, first.lastUpdateTs * 1000)]);
      await refreshMarket();

      subs.push(connection.onAccountChange(ORACLE_PDA, (info) => {
        try {
          const d = decodeOracle(oProg.coder.accounts.decode("oracle", info.data));
          setOracle(d);
          setHistory((h) => [...h.slice(-499), point(d, d.lastUpdateTs * 1000)]);
        } catch {}
      }, { commitment: "confirmed" }));
      subs.push(connection.onAccountChange(MARKET_PDA, (info) => {
        try { setMarket(decodeMarket(pProg.coder.accounts.decode("market", info.data))); } catch {}
      }, { commitment: "confirmed" }));

      const pollSlot = async () => { try { const s = await connection.getSlot("confirmed"); if (!cancelled) setSlot(BigInt(s)); } catch {} };
      pollSlot();
      timers.push(setInterval(pollSlot, 2000));

      // backfill: recent IndexUpdated events from the oracle's transaction logs
      try {
        const sigs = await connection.getSignaturesForAddress(ORACLE_PDA, { limit: 60 }, "confirmed");
        const ok = sigs.filter((s) => !s.err).map((s) => s.signature);
        lastSig.current = ok[0] ?? "";
        const parser = new EventParser(oProg.programId, oProg.coder);
        const merge = (pts: IndexPoint[]) => setHistory((h) => {
          const merged = [...pts, ...h].sort((a, b) => a.t - b.t);
          return merged.filter((p, i) => i === 0 || p.t !== merged[i - 1].t).slice(-500);
        });
        // small batches, spaced out (~5 requests/s): free RPC plans cap requests per second
        // and answer bursts with 429s. 60 updates = the last ~10 min at one publish per 10 s.
        for (let k = 0; k < ok.length && !cancelled; k += 5) {
          if (k) await new Promise((r) => setTimeout(r, 1000));
          let txs: Awaited<ReturnType<typeof connection.getTransactions>> = [];
          try {
            txs = await connection.getTransactions(ok.slice(k, k + 5), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
          } catch { continue; }
          const pts: IndexPoint[] = [];
          for (const tx of txs) {
            if (!tx?.meta?.logMessages) continue;
            for (const ev of parser.parseLogs(tx.meta.logMessages)) {
              if (ev.name.toLowerCase() !== "indexupdated") continue;
              const d = ev.data as any;
              pts.push({ t: (tx.blockTime ?? 0) * 1000, index: Number(d.index.toString()), priority: Number(d.priorityIndex.toString()), tips: Number(d.tipIndex.toString()) });
            }
          }
          // show each batch as it arrives, so the chart fills in instead of waiting for all of them
          if (!cancelled && pts.length) merge(pts);
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearInterval);
      subs.forEach((id) => connection.removeAccountChangeListener(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  return <SurgeCtx.Provider value={{ mode, oracle, market, slot, history, error, refreshMarket }}>{children}</SurgeCtx.Provider>;
}
