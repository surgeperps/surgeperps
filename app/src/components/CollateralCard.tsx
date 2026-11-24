"use client";
// Why: collateral is separate from trading: users top up before a spike or
//      take profit out after one.
// How: shows wallet SOL, position equity and what can be withdrawn without
//      breaking initial margin (the same check withdraw() makes on-chain),
//      with deposit and withdraw forms.
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useSurge } from "./SurgeData";
import { useTrader } from "./useTrader";
import { health, solToLamports, type PositionState } from "@/lib/math";
import { sol } from "@/lib/format";

export function CollateralCard({ position, hasAccount, onDone }: { position: PositionState | null; hasAccount: boolean; onDone: () => void }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { oracle, market, slot, mode } = useSurge();
  const t = useTrader(onDone);
  const [bal, setBal] = useState<number | null>(null);
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");

  useEffect(() => {
    if (!publicKey) { setBal(null); return; }
    let on = true;
    const load = () => connection.getBalance(publicKey, "confirmed").then((b) => on && setBal(b)).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => { on = false; clearInterval(id); };
  }, [publicKey, connection, t.busy]);

  const h = position && oracle && market ? health(position, market, oracle.index, slot) : null;
  const disabled = !publicKey || mode !== "live" || !market || t.busy;

  return (
    <section className="card coll" aria-label="Collateral">
      <h2>Collateral</h2>
      <dl className="summary tight">
        <div><dt>Wallet</dt><dd className="mono">{bal == null ? "—" : `${sol(bal)} SOL`}</dd></div>
        <div><dt>Equity in position</dt><dd className="mono">{h ? `${sol(h.equity)} SOL` : "—"}</dd></div>
        <div><dt>Withdrawable</dt><dd className="mono">{h ? `${sol(h.withdrawable)} SOL` : "—"}</dd></div>
      </dl>
      <form className="row-form" onSubmit={(e) => { e.preventDefault(); const l = solToLamports(Number(dep) || 0); if (l > 0n) t.deposit(l, hasAccount).then(() => setDep("")); }}>
        <label className="sr" htmlFor="dep2">Deposit SOL</label>
        <div className="input sm"><input id="dep2" inputMode="decimal" placeholder="0.00" value={dep} onChange={(e) => setDep(e.target.value.replace(/[^0-9.]/g, ""))} /><span className="unit">SOL</span></div>
        <button type="submit" className="btn ghost" disabled={disabled}>Deposit</button>
      </form>
      <form className="row-form" onSubmit={(e) => { e.preventDefault(); const l = solToLamports(Number(wd) || 0); if (l > 0n) t.withdraw(l).then(() => setWd("")); }}>
        <label className="sr" htmlFor="wd">Withdraw SOL</label>
        <div className="input sm"><input id="wd" inputMode="decimal" placeholder="0.00" value={wd} onChange={(e) => setWd(e.target.value.replace(/[^0-9.]/g, ""))} /><button type="button" className="max" onClick={() => h && setWd((Math.floor((Number(h.withdrawable) / 1e9) * 1e4) / 1e4).toString())}>Max</button></div>
        <button type="submit" className="btn ghost" disabled={disabled || !hasAccount}>Withdraw</button>
      </form>
      {!publicKey && <p className="fine">Connect a wallet to deposit. Need devnet SOL? Use faucet.solana.com.</p>}
    </section>
  );
}
