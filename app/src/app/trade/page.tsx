"use client";
// Why: the trading screen: chart and market info on the left, order ticket
//      and collateral on the right, the user's position underneath (steps 8-11
//      in the browser).
// How: composes MarketHeader, IndexChart, OrderTicket, CollateralCard and
//      PositionPanel around the shared live feed and the wallet's Position
//      account. ?side=long&size=500 pre-fills the ticket (used by the hedge page).
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSurge } from "@/components/SurgeData";
import { MarketHeader } from "@/components/MarketHeader";
import { IndexChart } from "@/components/IndexChart";
import { OrderTicket } from "@/components/OrderTicket";
import { CollateralCard } from "@/components/CollateralCard";
import { PositionPanel } from "@/components/PositionPanel";
import { MarketInfo } from "@/components/MarketInfo";
import { usePosition } from "@/components/usePosition";

function Trade() {
  const { history, mode } = useSurge();
  const { connected } = useWallet();
  const { position, refresh } = usePosition(mode === "live");
  const [tab, setTab] = useState<"position" | "info">("position");
  const q = useSearchParams();
  const side = q.get("side") === "short" ? "short" : "long";
  const size = Number(q.get("size")) > 0 ? Number(q.get("size")) : 500;
  const hasAccount = !!position;

  return (
    <div className="stack">
      {mode === "demo" && <div className="banner">Demo feed. The programs aren&apos;t deployed on this network yet, so prices are simulated and trading is off.</div>}
      <MarketHeader />
      <div className="trade-grid">
        <div className="stack">
          <section className="card pad"><IndexChart points={history} height={340} /></section>
          <section className="card pad">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "position"} className={tab === "position" ? "on" : ""} onClick={() => setTab("position")}>Your position</button>
              <button type="button" role="tab" aria-selected={tab === "info"} className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>Market rules</button>
            </div>
            {tab === "position" ? (connected ? <PositionPanel position={position} onDone={refresh} /> : <div className="empty">Connect a wallet to see your position.</div>) : <MarketInfo />}
          </section>
        </div>
        <div className="stack side">
          <OrderTicket position={position} hasAccount={hasAccount} onDone={refresh} initialSide={side} initialSize={size} />
          <CollateralCard position={position} hasAccount={hasAccount} onDone={refresh} />
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  return <Suspense fallback={<div className="empty">Loading…</div>}><Trade /></Suspense>;
}
