"use client";
// Why: the index has to be public and checkable. Anyone should be able to see
//      the current value, how it splits and how it's built before trusting a
//      market on it (step 7).
// How: reads the shared live feed (oracle account over WebSocket plus recent
//      IndexUpdated events) and shows the number, the two sub-indices, the
//      chart, the method and the on-chain addresses.
import Link from "next/link";
import { useSurge } from "@/components/SurgeData";
import { IndexChart } from "@/components/IndexChart";
import { Freshness } from "@/components/Freshness";
import { MarketInfo } from "@/components/MarketInfo";
import { indexSol, times } from "@/lib/format";
import { Num } from "@/components/Num";

export default function IndexPage() {
  const { oracle, history, mode, error } = useSurge();
  const vals = history.map((h) => h.index);
  const peak = vals.length ? Math.max(...vals) : 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const w = oracle ? oracle.weightBps / 100 : 79;

  return (
    <div className="stack reveal">
      {mode === "demo" && <div className="banner">Demo feed. The oracle isn't deployed on this network yet, so these numbers are simulated. Once the keeper publishes, this page goes live on its own.</div>}
      {error && <div className="banner bad">{error}</div>}

      <section className="hero card">
        <div className="hero-fx" aria-hidden="true"><svg viewBox="0 0 600 120" preserveAspectRatio="none"><polyline points="0,80 300,80 322,80 336,40 352,112 366,62 378,80 600,80" pathLength={1} /></svg></div>
        <div className="hero-l">
          <div className="eyebrow"><span className="live-dot" aria-hidden="true" />Surge fee index</div>
          <div className="hero-num mono">{oracle ? <Num value={Number(oracle.index)} format={indexSol} /> : "—"}<span className="hero-unit">SOL / slot</span></div>
          <div className="hero-sub"><b className="orange mono">{oracle ? <Num value={Number(oracle.index)} format={times} /> : "—"}</b> <span className="muted">vs normal</span> <Freshness /></div>
          <p className="muted lead">One number for what Solana costs right now: the median of what blocks paid over the last 100 slots, combined on-chain from priority fees and Jito tips.</p>
          <div className="hero-cta">
            <Link className="btn primary" href="/trade">Trade the index</Link>
            <Link className="btn ghost" href="/hedge">Lock in my gas bill</Link>
          </div>
        </div>
        <div className="hero-r">
          <div className="kpi"><small>Now</small><b className="mono">{oracle ? <Num value={Number(oracle.index)} format={times} /> : "—"}</b></div>
          <div className="kpi"><small>Peak · loaded range</small><b className="mono">{peak ? times(peak) : "—"}</b></div>
          <div className="kpi"><small>Median · loaded range</small><b className="mono">{median ? times(median) : "—"}</b></div>
        </div>
      </section>

      <section className="card pad chart-card">
        <IndexChart points={history} height={320} />
      </section>

      <div className="grid2">
        <section className="card pad sub">
          <div className="sub-head"><h2><i className="dot-p" aria-hidden="true" />Priority fees · P</h2><span className="chip">{w}% weight</span></div>
          <div className="sub-num mono">{oracle ? <Num value={Number(oracle.priority)} format={indexSol} /> : "—"} <span className="muted">SOL / slot</span></div>
          <p className="muted small">Each transaction's fee minus the 5,000-lamport base fee per signature, summed per block, median of the last 100 slots.</p>
        </section>
        <section className="card pad sub">
          <div className="sub-head"><h2><i className="dot-t" aria-hidden="true" />Jito tips · T</h2><span className="chip">{100 - w}% weight</span></div>
          <div className="sub-num mono">{oracle ? <Num value={Number(oracle.tips)} format={indexSol} /> : "—"} <span className="muted">SOL / slot</span></div>
          <p className="muted small">SOL arriving at Jito&apos;s eight tip accounts in each block. Most fee dashboards leave tips out; they&apos;re about a fifth of all fee spend.</p>
        </section>
      </div>

      <div className="grid2">
        <section className="card pad">
          <h2>How it&apos;s built</h2>
          <ol className="steps">
            <li><b>Keeper reads every block</b><span className="muted">TypeScript service calling getBlock over RPC.</span></li>
            <li><b>Two medians</b><span className="muted">Priority fees (P) and Jito tips (T), last 100 slots.</span></li>
            <li><b>Published on-chain</b><span className="muted">update_index(P, T), signed by the keeper key only.</span></li>
            <li><b>Combined by the program</b><span className="muted mono">index = {w / 100}·P + {(100 - w) / 100}·T</span></li>
          </ol>
        </section>
        <section className="card pad">
          <h2>Check it yourself</h2>
          <MarketInfo oneColumn />
        </section>
      </div>
    </div>
  );
}
