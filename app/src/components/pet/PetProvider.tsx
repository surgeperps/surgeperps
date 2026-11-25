"use client";
// Why: Kai, the SurgePerps pet, has to hear about everything that happens in
//      the app (trades, errors, index spikes, wallet connects, page changes)
//      without every component knowing how Kai draws or talks.
// How: one context. Components call say(text, { mood, voice }) or setBase(mood).
//      A transient mood (happy, panic…) lasts a few seconds, then Kai falls
//      back to the base mood (set by long-lived state such as a weak position)
//      or to idle. Lines marked voice are also read aloud with the browser's
//      speech synthesis when the user has the voice switched on. Settings
//      (voice, hidden) are remembered in localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Mood = "idle" | "happy" | "excited" | "love" | "thinking" | "worried" | "panic" | "sad" | "sleep" | "wave";
export type Line = { id: number; text: string; mood: Mood; link?: string };
type SayOpts = { mood?: Mood; voice?: boolean; ms?: number; link?: string; action?: Action };
export type Action = "hop" | "shake" | "spin" | "wave" | "wiggle" | "stretch" | null;

type Ctx = {
  mood: Mood;
  line: Line | null;
  action: Action;
  voiceOn: boolean;
  hidden: boolean;
  say: (text: string, opts?: SayOpts) => void;
  act: (a: Action, ms?: number) => void;
  setBase: (m: Mood | null) => void;
  setMood: (m: Mood, ms?: number) => void;
  clearLine: () => void;
  toggleVoice: () => void;
  setHidden: (h: boolean) => void;
};
const PetCtx = createContext<Ctx | null>(null);
const NOOP: Ctx = { mood: "idle", line: null, action: null, voiceOn: false, hidden: true, say: () => {}, act: () => {}, setBase: () => {}, setMood: () => {}, clearLine: () => {}, toggleVoice: () => {}, setHidden: () => {} };
export const usePet = () => useContext(PetCtx) ?? NOOP;

const KEY = "surge-pet";
const MOOD_ACTION: Partial<Record<Mood, Action>> = { excited: "hop", panic: "shake", happy: "wiggle", love: "wiggle", wave: "wave" };

/** speech without emoji or symbols the voice would spell out */
function speakable(t: string) {
  return t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/×/g, " times").replace(/·/g, ",").replace(/\s+/g, " ").trim();
}

export function PetProvider({ children }: { children: ReactNode }) {
  const [base, setBaseState] = useState<Mood | null>(null);
  const [temp, setTemp] = useState<Mood | null>(null);
  const [line, setLine] = useState<Line | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [hidden, setHiddenState] = useState(false);
  const tMood = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tLine = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tAct = useRef<ReturnType<typeof setTimeout>>(undefined);
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      if (typeof s.voice === "boolean") setVoiceOn(s.voice);
      if (typeof s.hidden === "boolean") setHiddenState(s.hidden);
    } catch {}
  }, []);
  const persist = (v: boolean, h: boolean) => { try { localStorage.setItem(KEY, JSON.stringify({ voice: v, hidden: h })); } catch {} };

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

  const speak = useCallback((text: string) => {
    if (!voiceRef.current || hiddenRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
      const pick = voices.find((v) => /Samantha|Google US English|Karen|Moira|Tessa|Zira/i.test(v.name)) ?? voices[0];
      if (pick) u.voice = pick;
      u.rate = 1.06;
      u.pitch = 1.35;
      u.volume = 0.9;
      synth.speak(u);
    } catch {}
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
    if (opts.voice) speak(text);
  }, [act, setMood, speak]);

  const value = useMemo<Ctx>(() => ({
    mood: temp ?? base ?? "idle",
    line,
    action,
    voiceOn,
    hidden,
    say,
    act,
    setMood,
    setBase: (m) => setBaseState(m),
    clearLine: () => { clearTimeout(tLine.current); setLine(null); },
    toggleVoice: () => setVoiceOn((v) => {
      const n = !v;
      persist(n, hiddenRef.current);
      if (!n && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      return n;
    }),
    setHidden: (h) => { setHiddenState(h); persist(voiceRef.current, h); },
  }), [temp, base, line, action, voiceOn, hidden, say, act, setMood]);

  return <PetCtx.Provider value={value}>{children}</PetCtx.Provider>;
}
