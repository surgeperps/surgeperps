"use client";
// Why: traders and judges should be able to check the rules and the
//      addresses themselves instead of trusting the UI.
// How: lists the live MarketParams, pool and open interest, and links every
//      program and account to the Solana Explorer.
import { useSurge } from "./SurgeData";
import { MARKET_PDA, ORACLE_PDA } from "@/lib/programs";
import { ORACLE_PROGRAM_ID, PERP_PROGRAM_ID, explorerAddr } from "@/lib/config";
import { rawToSlots } from "@/lib/math";
import { short, sol } from "@/lib/format";

export function MarketInfo({ oneColumn = false }: { oneColumn?: boolean }) {
  const { market, oracle } = useSurge();
  const p = market?.params;
  const rows: [string, string][] = p ? [
    ["Initial margin", `${p.initialMarginBps / 100}% (max ${(10_000 / p.initialMarginBps).toFixed(1)}× leverage)`],
    ["Maintenance margin", `${p.maintenanceMarginBps / 100}%`],
    ["Liquidation fee", `${p.liquidationFeeBps / 100}% of exposure, to the liquidator`],
    ["Taker fee", `${p.takerFeeBps / 100}%, to the liquidity pool`],
    ["Max funding", `${p.maxFundingBpsPerDay / 100}% per day at full skew`],
    ["Position limit", `${rawToSlots(p.maxPositionSize).toLocaleString("en-US")} slots`],
    ["Skew cap", `${rawToSlots(p.maxSkew).toLocaleString("en-US")} slots`],
    ["Oracle must be fresher than", `${p.maxStalenessSlots} slots (~${Math.round(Number(p.maxStalenessSlots) * 0.4)} s)`],
    ["Liquidity pool", `${sol(market!.lpBalance)} SOL`],
    ["Index weights", oracle ? `${oracle.weightBps / 100}% priority · ${(10_000 - oracle.weightBps) / 100}% tips` : "—"],
  ] : [];
  const addrs: [string, string][] = [["Oracle program", ORACLE_PROGRAM_ID.toBase58()], ["Perp program", PERP_PROGRAM_ID.toBase58()], ["Oracle account", ORACLE_PDA.toBase58()], ["Market account", MARKET_PDA.toBase58()]];
  return (
    <div className={oneColumn ? "info one" : "info"}>
      <dl className="summary">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <dl className="summary">{addrs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><a className="mono" href={explorerAddr(v)} target="_blank" rel="noreferrer">{short(v)} ↗</a></dd></div>)}</dl>
    </div>
  );
}
