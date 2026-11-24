"use client";
// Why: a perp on a stale price is dangerous, and the perp program rejects
//      trades when the oracle is older than max_staleness_slots. Users should
//      see that before they try to trade.
// How: compares the current slot with the oracle's last_update_slot and shows
//      a live / delayed / stale pill (≈0.4 s per slot).
import { useSurge } from "./SurgeData";

export function Freshness() {
  const { oracle, market, slot, mode } = useSurge();
  if (!oracle || slot === 0n) return <span className="fresh">● connecting…</span>;
  const age = slot > oracle.lastUpdateSlot ? Number(slot - oracle.lastUpdateSlot) : 0;
  const limit = market ? Number(market.params.maxStalenessSlots) : 150;
  const state = age > limit ? "stale" : age > limit / 2 ? "late" : "ok";
  const text = state === "stale" ? "STALE · trades paused" : `${mode === "demo" ? "DEMO" : "LIVE"} · updated ${age} slot${age === 1 ? "" : "s"} ago`;
  return <span className={`fresh ${state}`} title={`Oracle updated at slot ${oracle.lastUpdateSlot}, now ${slot}. Limit ${limit} slots (~${Math.round(limit * 0.4)} s).`}>● {text}</span>;
}
