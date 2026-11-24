"use client";
// Why: once a trade is open, the user needs to see how it's doing and how
//      close it is to liquidation, and be able to close it in one click.
// How: computes PnL, pending funding, equity, leverage, margin health and
//      liquidation index with the same maths as the program (lib/math.ts);
//      Close sends trade(-size), Reduce sends trade(-size/2).
import { useSurge } from "./SurgeData";
import { useTrader } from "./useTrader";
import { health, type PositionState } from "@/lib/math";
import { indexSol, signedSol, slots, sol, times } from "@/lib/format";

export function PositionPanel({ position, onDone }: { position: PositionState | null; onDone: () => void }) {
  const { oracle, market, slot } = useSurge();
  const t = useTrader(onDone);
  if (!position || !oracle || !market) {
    return <div className="empty">No open position. Pick a side and size in the ticket to open one.</div>;
  }
  const h = health(position, market, oracle.index, slot);
  const side = position.size > 0n ? "Long" : position.size < 0n ? "Short" : "Flat";
  const abs = position.size < 0n ? -position.size : position.size;
  const ratio = Math.min(3, Math.max(0, isFinite(h.ratio) ? h.ratio : 3));
  const tone = h.ratio < 1.2 ? "bad" : h.ratio < 1.6 ? "mid" : "good";

  return (
    <div className="pos">
      <div className="pos-grid">
        <div><small>Side</small><b className={side === "Long" ? "orange" : side === "Short" ? "ink" : ""}>{side}</b></div>
        <div><small>Size</small><b className="mono">{slots(abs)} slots</b></div>
        <div><small>Entry index</small><b className="mono">{position.size === 0n ? "—" : `${indexSol(position.entryIndex)} · ${times(position.entryIndex)}`}</b></div>
        <div><small>Index now</small><b className="mono">{indexSol(oracle.index)} · {times(oracle.index)}</b></div>
        <div><small>Unrealised PnL</small><b className={`mono ${h.unrealized > 0n ? "orange" : h.unrealized < 0n ? "red" : ""}`}>{signedSol(h.unrealized)} SOL</b></div>
        <div><small>Funding owed</small><b className="mono">{signedSol(-h.funding)} SOL</b></div>
        <div><small>Collateral</small><b className="mono">{sol(position.collateral)} SOL</b></div>
        <div><small>Equity</small><b className="mono">{sol(h.equity)} SOL</b></div>
        <div><small>Leverage</small><b className="mono">{h.notional === 0n ? "—" : isFinite(h.leverage) ? h.leverage.toFixed(2) + "×" : "∞"}</b></div>
        <div><small>Liquidation index</small><b className="mono">{h.liqIndex == null ? "—" : `${indexSol(h.liqIndex)} · ${times(h.liqIndex)}`}</b></div>
      </div>
      {position.size !== 0n && (
        <>
          <div className="healthrow">
            <span className="muted small">Margin health</span>
            <div className={`hbar ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={ratio} aria-label="Equity over maintenance margin">
              <i style={{ width: `${(ratio / 3) * 100}%` }} />
              <span className="hmark" style={{ left: `${100 / 3}%` }} title="Maintenance margin" />
            </div>
            <span className="mono small">{isFinite(h.ratio) ? h.ratio.toFixed(2) + "× maint." : "—"}</span>
          </div>
          <div className="pos-actions">
            <button type="button" className="btn ghost" disabled={t.busy} onClick={() => t.trade(-position.size / 2n, 0n, true, "Reduce 50%")}>Reduce 50%</button>
            <button type="button" className="btn dark" disabled={t.busy} onClick={() => t.trade(-position.size, 0n, true, "Close position")}>Close position</button>
          </div>
        </>
      )}
    </div>
  );
}
