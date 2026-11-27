"use client";
// Why: Kai, the SurgePerps pet, has to hear about everything that happens in
//      the app (trades, errors, index spikes, wallet connects, page changes)
//      without every component knowing how Kai draws or talks.
// How: one context. Components call say(text, { mood }) or setBase(mood).
//      A transient mood (happy, panic…) lasts a few seconds, then Kai falls
//      back to the base mood (set by long-lived state such as a weak position)
//      or to idle. Kai is silent: lines only appear in the speech bubble.
//      Whether Kai is tucked away is remembered in localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Mood = "idle" | "happy" | "excited" | "love" | "thinking" | "worried" | "panic" | "sad" | "sleep" | "wave";
export type Line = { id: number; text: string; mood: Mood; link?: string };
type SayOpts = { mood?: Mood; ms?: number; link?: string; action?: Action };
export type Action = "hop" | "shake" | "spin" | "wave" | "wiggle" | "stretch" | null;

type Ctx = {
  mood: Mood;
  line: Line | null;
  action: Action;
  hidden: boolean;
  say: (text: string, opts?: SayOpts) => void;
  act: (a: Action, ms?: number) => void;
  setBase: (m: Mood | null) => void;
  setMood: (m: Mood, ms?: number) => void;
  clearLine: () => void;
  setHidden: (h: boolean) => void;
};
const PetCtx = createContext<Ctx | null>(null);
const NOOP: Ctx = { mood: "idle", line: null, action: null, hidden: true, say: () => {}, act: () => {}, setBase: () => {}, setMood: () => {}, clearLine: () => {}, setHidden: () => {} };
export const usePet = () => useContext(PetCtx) ?? NOOP;

const KEY = "surge-pet";
const MOOD_ACTION: Partial<Record<Mood, Action>> = { excited: "hop", panic: "shake", happy: "wiggle", love: "wiggle", wave: "wave" };

export function PetProvider({ children }: { children: ReactNode }) {
  const [base, setBaseState] = useState<Mood | null>(null);
  const [temp, setTemp] = useState<Mood | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [hidden, setHiddenState] = useState(false);
  const tMood = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tLine = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tAct = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      if (typeof s.hidden === "boolean") setHiddenState(s.hidden);
    } catch {}
  }, []);
  const persist = (h: boolean) => { try { localStorage.setItem(KEY, JSON.stringify({ hidden: h })); } catch {} };

  const act = useCallback((a: Action, ms = 1100) => {
    clearTimeout(tAct.current);
    setAction(null);
    // next frame, so the same action can replay
    requestAnimationFrame(() => setAction(a));
    if (a) tAct.current = setTimeout(() => setAction(null), ms);
  }, []);

  const setMood = useCallback((m: Mood, ms = 4500) => {
    clearTimeout(tMood.current);
    setTemp(m);
    tMood.current = setTimeout(() => setTemp(null), ms);
  }, []);

  const say = useCallback((text: string, opts: SayOpts = {}) => {
    const mood = opts.mood ?? "happy";
    const ms = opts.ms ?? Math.min(9000, 2600 + text.length * 45);
    clearTimeout(tLine.current);
    setLine({ id: Date.now() + Math.random(), text, mood, link: opts.link });
    tLine.current = setTimeout(() => setLine(null), ms);
    setMood(mood, ms);
    const a = opts.action === undefined ? MOOD_ACTION[mood] ?? null : opts.action;
    if (a) act(a);
  }, [act, setMood]);

  const value = useMemo<Ctx>(() => ({
    mood: temp ?? base ?? "idle",
    line,
    action,
    hidden,
    say,
    act,
    setMood,
    setBase: (m) => setBaseState(m),
    clearLine: () => { clearTimeout(tLine.current); setLine(null); },
    setHidden: (h) => { setHiddenState(h); persist(h); },
  }), [temp, base, line, action, hidden, say, act, setMood]);

  return <PetCtx.Provider value={value}>{children}</PetCtx.Provider>;
}
