"use client";
// Why: the product for apps and wallets that pay Solana fees but don't trade.
//      They enter their monthly fee bill and get the long position that keeps
//      that bill steady when fees spike (step 12).
// How: size = monthly bill ÷ current index (in slots of blockspace). A perp
//      locks the cost in both directions: if fees fall, the hedge loses what
//      the bill saves. The scenario table and chart show that, then a link
//      pre-fills the trade ticket with the suggested size.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSurge } from "@/components/SurgeData";
import { LAMPORTS, marginReq, slotsToRaw } from "@/lib/math";
import { indexSol, times } from "@/lib/format";

const SCEN = [0.5, 1, 2, 5, 10, 40];

export default function HedgePage() {
  const { oracle, market } = useSurge();
  const [billStr, setBillStr] = useState("10");
  const [ratio, setRatio] = useState(100);
  const bill = Math.max(0, Number(billStr) || 0);
  const idx = oracle ? Number(oracle.index) / LAMPORTS : 0;
  const sizeSlots = idx > 0 ? (bill / idx) * (ratio / 100) : 0;
  const margin = oracle && market ? Number(marginReq(slotsToRaw(sizeSlots), oracle.index, market.params.initialMarginBps)) / LAMPORTS : 0;

  const rows = useMemo(() => SCEN.map((m) => {
    const billAt = bill * m;
    const payout = sizeSlots * idx * (m - 1);
    return { m, billAt, payout, net: billAt - payout };
  }), [bill, sizeSlots, idx]);

  // chart: monthly cost vs index multiple, 0.5x..40x on a log axis
  const W = 560, H = 300, pl = 56, pb = 34, pt = 14, pr = 16;
  const xs = (m: number) => pl + ((Math.log(m) - Math.log(0.5)) / (Math.log(40) - Math.log(0.5))) * (W - pl - pr);
  const maxY = Math.max(1, bill * 40);
  const ys = (v: number) => pt + (1 - Math.min(1, Math.max(0, v / maxY))) * (H - pt - pb);
  const curve = (f: (m: number) => number) => Array.from({ length: 60 }, (_, i) => 0.5 * Math.pow(80, i / 59)).map((m, i) => `${i ? "L" : "M"}${xs(m).toFixed(1)},${ys(f(m)).toFixed(1)}`).join(" ");

  return (
    <div className="stack">
      <section className="card pad hedge-intro">
        <div className="eyebrow">Hedge app</div>
        <h1>Lock in your Solana gas bill</h1>
        <p className="muted lead">If your app pays users&apos; fees, a launch or a big mint can multiply your bill overnight. A long on the fee index pays out as fees rise, so your total cost stays where it is today.</p>
      </section>

      <div className="hedge-grid">
        <section className="card pad">
          <label className="field-lbl" htmlFor="bill">Monthly fee bill today</label>
          <div className="input"><input id="bill" inputMode="decimal" value={billStr} onChange={(e) => setBillStr(e.target.value.replace(/[^0-9.]/g, ""))} /><span className="unit">SOL</span></div>

          <label className="field-lbl" htmlFor="ratio">How much to hedge · {ratio}%</label>
          <input id="ratio" type="range" min={10} max={100} step={5} value={ratio} onChange={(e) => setRatio(Number(e.target.value))} className="range" />

          <div className="sized">
            <small>Surge sizes it for you</small>
            <b className="mono">Long {sizeSlots.toLocaleString("en-US", { maximumFractionDigits: 0 })} slots</b>
            <span className="muted small">at today&apos;s index {oracle ? `${indexSol(oracle.index)} SOL/slot (${times(oracle.index)})` : "—"}</span>
            <span className="muted small">Collateral needed ≈ <b className="mono ink">{margin.toFixed(2)} SOL</b>{market ? ` (${market.params.initialMarginBps / 100}% initial margin)` : ""}, plus a buffer</span>
          </div>
          <Link className="btn primary wide" href={`/trade?side=long&size=${Math.round(sizeSlots)}`}>Open this hedge</Link>
          <p className="fine">A perp locks your cost rather than capping it: if fees fall, the hedge loses about what your bill saves. Funding and the taker fee are the price of the cover. SOL-denominated; SOL price moves aren&apos;t hedged.</p>
        </section>

        <section className="card pad">
          <h2>Your monthly cost as fees change</h2>
          <div className="legend" aria-hidden="true"><span><i className="dash" />without a hedge</span><span><i />with Surge</span></div>
          <svg viewBox={`0 0 ${W} ${H}`} className="payoff" role="img" aria-label="Without a hedge, cost rises with the fee index; with the hedge it stays near today's bill">
            {[0.5, 1, 2, 5, 10, 40].map((m) => (
              <g key={m}><line x1={xs(m)} x2={xs(m)} y1={pt} y2={H - pb} className="grid" /><text x={xs(m)} y={H - 12} textAnchor="middle" className="axis">{m}×</text></g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}><line x1={pl} x2={W - pr} y1={ys(maxY * f)} y2={ys(maxY * f)} className="grid" /><text x={pl - 8} y={ys(maxY * f) + 4} textAnchor="end" className="axis">{(maxY * f).toFixed(0)}</text></g>
            ))}
            <path d={curve((m) => bill * m)} className="line-muted" />
            <path d={curve((m) => bill * m - sizeSlots * idx * (m - 1))} className="line" />
          </svg>
          <table className="tbl">
            <thead><tr><th>Fee index</th><th>Your bill</th><th>Hedge pays</th><th>Net cost</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.m} className={r.m === 1 ? "now" : ""}>
                  <td className="mono">{r.m}×{r.m === 1 ? " (today)" : ""}</td>
                  <td className="mono">{r.billAt.toFixed(2)} SOL</td>
                  <td className={`mono ${r.payout > 0 ? "orange" : r.payout < 0 ? "red" : ""}`}>{r.payout >= 0 ? "+" : "−"}{Math.abs(r.payout).toFixed(2)} SOL</td>
                  <td className="mono"><b>{r.net.toFixed(2)} SOL</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">Before funding and fees. Assumes your bill moves with the network-wide index; your own fees can move differently.</p>
        </section>
      </div>
    </div>
  );
}
