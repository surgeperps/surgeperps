"use client";
// Why: the place a user decides long or short, how big, and how much
//      collateral, and sees every consequence before signing.
// How: previews the trade with the same checks trade() runs on-chain
//      (initial margin, size limit, skew cap, fee, stale oracle), suggests the
//      collateral to add, and sends open-account + deposit + trade as one
//      transaction when needed.
import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSurge } from "./SurgeData";
import { useTrader } from "./useTrader";
import { usePet } from "./pet/PetProvider";
import { LAMPORTS, previewTrade, rawToSlots, slotsToRaw, solToLamports, notional, fundingRatePerDay, type PositionState } from "@/lib/math";
import { indexSol, pct, slots as fmtSlots, sol, times } from "@/lib/format";

type Props = { position: PositionState | null; hasAccount: boolean; onDone: () => void; initialSide?: "long" | "short"; initialSize?: number };

const QUICK = [100, 500, 1000, 2500];

export function OrderTicket({ position, hasAccount, onDone, initialSide = "long", initialSize = 500 }: Props) {
  const { oracle, market, slot, mode } = useSurge();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const t = useTrader(onDone);
  const pet = usePet();
  const [side, setSideState] = useState<"long" | "short">(initialSide);
  const setSide = (s: "long" | "short") => {
    if (s !== side) pet.say(s === "long" ? "Long: you earn when Solana fees rise. Apps use this to lock in their fee bill." : "Short: you earn when fees fall. Validators use this to lock in their income.", { mood: s === "long" ? "excited" : "thinking", action: "hop" });
    setSideState(s);
  };
  const [sizeStr, setSizeStr] = useState(String(initialSize));
  const [depStr, setDepStr] = useState("");
  const [depTouched, setDepTouched] = useState(false);

  useEffect(() => { setSideState(initialSide); setSizeStr(String(initialSize)); }, [initialSide, initialSize]);

  const sizeSlots = Math.max(0, Number(sizeStr) || 0);
  const delta = (side === "long" ? 1n : -1n) * slotsToRaw(sizeSlots);
  const depLamports = solToLamports(Math.max(0, Number(depStr) || 0));

  const pv = useMemo(() => {
    if (!oracle || !market || delta === 0n) return null;
    const base = position ? { ...position, collateral: position.collateral + depLamports } : { collateral: depLamports, size: 0n, entryIndex: oracle.index, lastCumulativeFunding: market.cumulativeFunding };
    return previewTrade(base, market, oracle.index, slot, delta);
  }, [oracle, market, slot, delta, depLamports, position]);

  // suggest enough collateral for the new size, with a 15% buffer
  const suggested = useMemo(() => {
    if (!oracle || !market || delta === 0n) return 0n;
    const base = position ?? { collateral: 0n, size: 0n, entryIndex: oracle.index, lastCumulativeFunding: market.cumulativeFunding };
    const p = previewTrade(base, market, oracle.index, slot, delta);
    return p.shortfall > 0n ? (p.shortfall * 115n) / 100n : 0n;
  }, [oracle, market, slot, delta, position]);
  useEffect(() => { if (!depTouched) setDepStr(suggested > 0n ? (Math.ceil((Number(suggested) / LAMPORTS) * 100) / 100).toString() : ""); }, [suggested, depTouched]);

  const stale = !!oracle && !!market && slot > 0n && slot - oracle.lastUpdateSlot > market.params.maxStalenessSlots;
  const fr = market ? fundingRatePerDay(market) : 0;
  const maxSlots = market ? rawToSlots(market.params.maxPositionSize) : 0;

  let block: string | null = null;
  if (mode === "demo") block = "Demo feed: the programs aren't on this network yet, so trading is off.";
  else if (!market) block = "The market isn't initialised on this network yet.";
  else if (stale) block = "The index is stale, so the program will reject trades until the keeper publishes.";
  else if (pv?.overLimit) block = `Above the ${maxSlots.toLocaleString("en-US")}-slot position limit.`;
  else if (pv?.overSkew) block = "The market is too one-sided for this size. Try smaller.";
  else if (pv && pv.shortfall > 0n) block = `Add at least ${sol(pv.shortfall)} SOL more collateral.`;
  else if (delta === 0n) block = "Enter a size.";

  const label = !connected ? "Connect wallet" : `${hasAccount ? "" : "Create account & "}${side === "long" ? "Long" : "Short"} ${sizeSlots.toLocaleString("en-US")} slots`;

  async function submit() {
    if (!connected) { setVisible(true); return; }
    if (block) return;
    const ok = await t.trade(delta, depLamports, hasAccount, `${side === "long" ? "Long" : "Short"} ${sizeSlots.toLocaleString("en-US")} slots`);
    if (ok) { setDepTouched(false); }
  }

  return (
    <section className="card ticket" aria-label="Order ticket">
      <div className="side-seg" data-side={side} role="radiogroup" aria-label="Side">
        <button type="button" role="radio" aria-checked={side === "long"} className={side === "long" ? "long on" : "long"} onClick={() => setSide("long")}>Long<small>fees go up</small></button>
        <button type="button" role="radio" aria-checked={side === "short"} className={side === "short" ? "short on" : "short"} onClick={() => setSide("short")}>Short<small>fees go down</small></button>
      </div>

      <label className="field-lbl" htmlFor="size">Size</label>
      <div className="input">
        <input id="size" inputMode="decimal" value={sizeStr} onChange={(e) => setSizeStr(e.target.value.replace(/[^0-9.]/g, ""))} />
        <span className="unit">slots</span>
      </div>
      <div className="quick">
        {QUICK.map((q) => <button key={q} type="button" onClick={() => setSizeStr(String(q))} className={sizeSlots === q ? "on" : ""}>{q.toLocaleString("en-US")}</button>)}
      </div>
      <p className="hint">One slot = the fee index for one block. {oracle && sizeSlots > 0 ? <>This size moves like a fee bill of <b>{sol(notional(slotsToRaw(sizeSlots), oracle.index), 3)} SOL</b>.</> : null}</p>

      <label className="field-lbl" htmlFor="dep">Add collateral</label>
      <div className="input">
        <input id="dep" inputMode="decimal" placeholder="0.00" value={depStr} onChange={(e) => { setDepTouched(true); setDepStr(e.target.value.replace(/[^0-9.]/g, "")); }} />
        <span className="unit">SOL</span>
      </div>
      {suggested > 0n && depTouched && <button type="button" className="linkish" onClick={() => setDepTouched(false)}>Use suggested {sol(suggested, 2)} SOL</button>}

      <dl className="summary">
        <div><dt>Fills at index</dt><dd className="mono">{oracle ? `${indexSol(oracle.index)} · ${times(oracle.index)}` : "—"}</dd></div>
        <div><dt>Position after</dt><dd className="mono">{pv ? `${pv.newSize > 0n ? "Long " : pv.newSize < 0n ? "Short " : ""}${fmtSlots(pv.newSize < 0n ? -pv.newSize : pv.newSize)}` : "—"}</dd></div>
        <div><dt>Exposure</dt><dd className="mono">{pv ? `${sol(pv.notional, 3)} SOL` : "—"}</dd></div>
        <div><dt>Initial margin ({market ? market.params.initialMarginBps / 100 : "—"}%)</dt><dd className="mono">{pv ? `${sol(pv.required, 3)} SOL` : "—"}</dd></div>
        <div><dt>Taker fee</dt><dd className="mono">{pv ? `${sol(pv.fee, 5)} SOL` : "—"}</dd></div>
        <div><dt>Est. liquidation index</dt><dd className="mono">{pv?.liqIndex != null ? `${indexSol(pv.liqIndex)} · ${times(pv.liqIndex)}` : "—"}</dd></div>
        <div><dt>Funding · 24h</dt><dd className="mono">{market ? `${(side === "long" ? fr : -fr) > 0 ? "you pay " : "you earn "}${pct(Math.abs(fr), 3)}` : "—"}</dd></div>
      </dl>

      {block && connected && <p className="warnline" role="alert">{block}</p>}
      <button type="button" className={`btn primary wide ${side}`} disabled={connected && (!!block || t.busy)} onClick={submit}>
        {t.busy ? "Sending…" : label}
      </button>
      <p className="fine">Trades fill at the on-chain oracle index. Isolated margin, SOL collateral. Devnet only.</p>
    </section>
  );
}
