"use client";
// Why: the first thing a trader reads: what this market is, where the index
//      is, how it splits, who pays funding and how crowded each side is.
// How: a title row plus a scrollable strip of stats, all from the live
//      oracle and market accounts.
import { useSurge } from "./SurgeData";
import { Freshness } from "./Freshness";
import { fundingRatePerDay, rawToSlots } from "@/lib/math";
import { indexSol, pct, times } from "@/lib/format";
import { Logo } from "./Logo";
import { Num } from "./Num";

export function MarketHeader() {
  const { oracle, market } = useSurge();
  const fr = market ? fundingRatePerDay(market) : 0;
  const oi = market ? Number(market.longOi + market.shortOi) : 0;
  const longShare = market && oi > 0 ? Number(market.longOi) / oi : 0.5;
  return (
    <section className="mkt-head card">
      <div className="mkt-title">
        <span className="mkt-icon"><Logo size={26} animated /></span>
        <div>
          <h1>Solana Fee Index Perp</h1>
          <div className="muted small">What Solana users pay per slot: 79% priority fees + 21% Jito tips</div>
        </div>
        <span className="chip mono">FEE-INDEX-PERP</span>
        <div className="mkt-fresh"><Freshness /></div>
      </div>
      <div className="stats">
        <div className="stat big"><small>Index · SOL / slot</small><b className="mono">{oracle ? <Num value={Number(oracle.index)} format={indexSol} /> : "—"}</b></div>
        <div className="stat"><small>vs normal</small><b className="mono orange">{oracle ? <Num value={Number(oracle.index)} format={times} /> : "—"}</b></div>
        <div className="stat"><small>Priority fees · P</small><b className="mono">{oracle ? <Num value={Number(oracle.priority)} format={indexSol} /> : "—"}</b></div>
        <div className="stat"><small>Jito tips · T</small><b className="mono">{oracle ? <Num value={Number(oracle.tips)} format={indexSol} /> : "—"}</b></div>
        <div className="stat"><small>Funding · 24h</small><b className="mono">{market ? (fr >= 0 ? "+" : "") + pct(fr, 3) : "—"}</b><em className="muted">{fr > 0 ? "longs pay" : fr < 0 ? "shorts pay" : "balanced"}</em></div>
        <div className="stat oi">
          <small>Open interest · {market ? rawToSlots(market.longOi + market.shortOi).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—"} slots</small>
          <div className="oi-bar" aria-label={`Long ${Math.round(longShare * 100)}%, short ${Math.round((1 - longShare) * 100)}%`}>
            <i style={{ width: `${longShare * 100}%` }} />
          </div>
          <em className="muted">L {Math.round(longShare * 100)}% · S {Math.round((1 - longShare) * 100)}%</em>
        </div>
      </div>
    </section>
  );
}
