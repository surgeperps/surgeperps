"use client";
// Why: Kai should react to the market and to the user, not only to
//      transactions: a fee spike, a stale oracle, a wallet connecting, a new
//      page, or just a quiet minute.
// How: watches the shared live feed, the wallet and the route, and turns
//      changes into Kai lines. Market comments are rate-limited (one per 25 s)
//      so Kai never chatters over itself; page intros play once per session.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSurge } from "../SurgeData";
import { usePet } from "./PetProvider";
import { INDEX_BASELINE } from "@/lib/config";
import { short } from "@/lib/format";

const INTRO: Record<string, string> = {
  "/": "Hi, I'm Kai! This is the Surge fee index: what Solana blocks cost right now.",
  "/trade": "Trade desk! Long if you think fees go up, short if you think they calm down.",
  "/hedge": "Pay users' fees? Type your monthly bill and I'll size a hedge for you.",
  "/docs": "The docs! How Surge works, every formula, and a calculator to try them.",
};

export function PetWatcher() {
  const { oracle, market, slot, mode } = useSurge();
  const { publicKey, connected } = useWallet();
  const path = usePathname();
  const { say, setBase } = usePet();
  const lastIndex = useRef<bigint | null>(null);
  const lastMarketTalk = useRef(0);
  const wasStale = useRef(false);
  const wasConnected = useRef<boolean | null>(null);
  const seenIntro = useRef<Set<string>>(new Set());
  const demoNoted = useRef(false);

  // page intros, once per page per visit
  useEffect(() => {
    if (seenIntro.current.has(path) || !INTRO[path]) return;
    seenIntro.current.add(path);
    const t = setTimeout(() => say(INTRO[path], { mood: "wave", action: "wave" }), seenIntro.current.size === 1 ? 900 : 250);
    return () => clearTimeout(t);
  }, [path, say]);

  // wallet connect / disconnect
  useEffect(() => {
    if (wasConnected.current === null) { wasConnected.current = connected; return; }
    if (connected && !wasConnected.current && publicKey) say(`Hey ${short(publicKey.toBase58())}! Wallet connected. Let's go.`, { mood: "excited" });
    if (!connected && wasConnected.current) say("Wallet disconnected. See you soon!", { mood: "sad", action: "wave" });
    wasConnected.current = connected;
  }, [connected, publicKey, say]);

  // demo feed notice
  useEffect(() => {
    if (mode === "demo" && !demoNoted.current) {
      demoNoted.current = true;
      setTimeout(() => say("Heads up: I can't find the oracle on this network, so these numbers are pretend.", { mood: "thinking" }), 4000);
    }
  }, [mode, say]);

  // index moves
  useEffect(() => {
    if (!oracle) return;
    const prev = lastIndex.current;
    lastIndex.current = oracle.index;
    if (prev == null || prev === 0n || oracle.index === prev) return;
    const change = Number(oracle.index - prev) / Number(prev);
    const now = Date.now();
    if (now - lastMarketTalk.current < 25_000) return;
    const x = (Number(oracle.index) / Number(INDEX_BASELINE)).toFixed(2);
    if (change >= 0.25) {
      lastMarketTalk.current = now;
      say(`Whoa! Fees just jumped ${Math.round(change * 100)}%. The index is ${x}× normal. Longs are smiling.`, { mood: "panic" });
    } else if (change >= 0.08) {
      lastMarketTalk.current = now;
      say(`Fees are climbing: up ${Math.round(change * 100)}%, now ${x}× normal.`, { mood: "excited" });
    } else if (change <= -0.08) {
      lastMarketTalk.current = now;
      say(`Fees cooled off ${Math.round(-change * 100)}%. Now ${x}× normal. Shorts like that.`, { mood: "happy" });
    }
  }, [oracle, say]);

  // stale oracle: trades are paused until the keeper publishes
  useEffect(() => {
    if (!oracle || !market || slot === 0n || mode !== "live") return;
    const stale = slot - oracle.lastUpdateSlot > market.params.maxStalenessSlots;
    if (stale && !wasStale.current) {
      say("Uh oh, the index went stale. Trades are paused until the keeper publishes again.", { mood: "worried" });
      setBase("worried");
    } else if (!stale && wasStale.current) {
      say("The index is fresh again. Trading's back on!", { mood: "happy" });
      setBase(null);
    }
    wasStale.current = stale;
  }, [oracle, market, slot, mode, say, setBase]);

  // a quiet comment now and then
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || Date.now() - lastMarketTalk.current < 40_000 || !oracle) return;
      const x = Number(oracle.index) / Number(INDEX_BASELINE);
      const lines = x > 2
        ? [`Busy network: fees are ${x.toFixed(2)}× normal.`, "Lots of demand for blockspace right now."]
        : x < 0.8
          ? [`Quiet blocks: fees are only ${x.toFixed(2)}× normal.`, "Cheap blockspace today. Nice time to lock in a hedge."]
          : [`Fees look calm: ${x.toFixed(2)}× normal.`, "Every block, I check priority fees and Jito tips.", "Psst: the hedge page sizes a position from your monthly fee bill."];
      lastMarketTalk.current = Date.now();
      say(lines[Math.floor(Math.random() * lines.length)], { mood: "idle", action: null });
    }, 55_000);
    return () => clearInterval(id);
  }, [oracle, say]);

  return null;
}
