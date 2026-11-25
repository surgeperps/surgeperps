"use client";
// Why: the app's companion. Kai, a small explorer kid in a Surge jacket, sits in the corner, keeps itself busy, and
//      turns what happens on screen (a trade landing, an error, a fee spike)
//      into a face and a sentence, so the app feels alive and easy to read.
// How: Kai is a real-time 3D figure (Kai3D.tsx, three.js, loaded lazily).
//      While it loads, or where WebGL isn't available, an inline SVG version
//      stands in; its look is driven by two classes: m-<mood> picks eyes,
//      mouth and extras, a-<action> plays a one-off body animation. On its own
//      it blinks, follows the pointer with its eyes, fidgets every few seconds
//      and dozes off after 90 s without activity. Clicking him gets a reaction. The
//      speech bubble shows the latest line from PetProvider. It can be muted or
//      tucked away into a small button.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePet, type Action } from "./PetProvider";

const Kai3D = dynamic(() => import("./Kai3D"), { ssr: false, loading: () => <Kai /> });
function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

const IDLE: Action[] = ["hop", "wiggle", "stretch", "spin", "wave"];
const PET_LINES = ["Hey! I'm Kai. I watch Solana fees so you don't have to.", "Hehe, hi!", "Fully charged and watching every block.", "Back to watching fees!", "High five! Okay, back to work."];
const SLEEP_AFTER_MS = 90_000;

export function Pet() {
  const { mood, line, action, voiceOn, hidden, say, act, setMood, clearLine, toggleVoice, setHidden } = usePet();
  const root = useRef<HTMLDivElement>(null);
  const [blink, setBlink] = useState(false);
  const [three, setThree] = useState(false);
  useEffect(() => setThree(hasWebGL()), []);
  const noThree = useCallback(() => setThree(false), []);
  const [asleep, setAsleep] = useState(false);
  const lastActive = useRef(Date.now());
  const asleepRef = useRef(false);
  asleepRef.current = asleep;

  // eyes follow the pointer; any activity wakes Kai up
  useEffect(() => {
    const wake = () => {
      lastActive.current = Date.now();
      if (asleepRef.current) {
        setAsleep(false);
        say("Huh? Oh, I'm up! Watching the fees.", { mood: "wave", ms: 3000 });
      }
    };
    const move = (e: PointerEvent) => {
      wake();
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.55);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 220);
      el.style.setProperty("--px", `${((dx / d) * 3.4 * k).toFixed(2)}px`);
      el.style.setProperty("--py", `${((dy / d) * 3 * k).toFixed(2)}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("scroll", wake, { passive: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("keydown", wake); window.removeEventListener("scroll", wake); };
  }, [say]);

  // blinking, fidgeting and dozing off
  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => alive && fn(), ms));
    const blinkLoop = () => {
      setBlink(true);
      later(() => setBlink(false), 140);
      if (Math.random() < 0.25) later(() => { setBlink(true); later(() => setBlink(false), 120); }, 260);
      later(blinkLoop, 2600 + Math.random() * 3200);
    };
    const idleLoop = () => {
      if (Date.now() - lastActive.current > SLEEP_AFTER_MS) setAsleep(true);
      else if (!asleepRef.current && !document.hidden) act(IDLE[Math.floor(Math.random() * IDLE.length)]);
      later(idleLoop, 7000 + Math.random() * 6000);
    };
    later(blinkLoop, 1200);
    later(idleLoop, 5000);
    return () => { alive = false; timers.forEach(clearTimeout); };
  }, [act]);

  function poke() {
    lastActive.current = Date.now();
    setAsleep(false);
    say(PET_LINES[Math.floor(Math.random() * PET_LINES.length)], { mood: "love", ms: 2800 });
    setMood("love", 2400);
  }

  if (hidden) {
    return (
      <button type="button" className="pet-tucked" onClick={() => { setHidden(false); say("I'm back! Did I miss anything?", { mood: "wave" }); }} aria-label="Show Kai, the SurgePerps helper">
        <KaiFace />
      </button>
    );
  }

  const shown = asleep && mood === "idle" ? "sleep" : mood;
  return (
    <div ref={root} className={`pet m-${shown} ${action ? "a-" + action : ""} ${blink ? "blink" : ""} ${three ? "is-3d" : ""}`}>
      {line && (
        <div key={line.id} className={`pet-bubble t-${line.mood}`} role="status" aria-live="polite">
          <button type="button" className="pet-bubble-x" onClick={clearLine} aria-label="Dismiss">×</button>
          <p>{line.text}</p>
          {line.link && <a href={line.link} target="_blank" rel="noreferrer">View on Explorer ↗</a>}
        </div>
      )}
      <div className="pet-ctrl">
        <button type="button" onClick={toggleVoice} aria-label={voiceOn ? "Mute Kai" : "Let Kai talk"} title={voiceOn ? "Mute voice" : "Turn voice on"}>
          {voiceOn ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m17 9 5 6m0-6-5 6" fill="none" /></svg>
          )}
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Tuck Kai away" title="Tuck away">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" fill="none" /></svg>
        </button>
      </div>
      <button type="button" className="pet-hit" onClick={poke} aria-label="Say hi to Kai">
        {three ? <Kai3D mood={shown} action={action} blink={blink} onFail={noThree} /> : <Kai />}
      </button>
    </div>
  );
}

/** the full character; every part is styled from globals.css by mood/action */
function Kai() {
  return (
    <svg className="kai" viewBox="0 0 140 200" aria-hidden="true">
      <defs>
        <radialGradient id="kSkin" cx="42%" cy="38%" r="70%"><stop offset="0" stopColor="#ffe2cc" /><stop offset="0.7" stopColor="#f6bf9b" /><stop offset="1" stopColor="#e39c74" /></radialGradient>
        <linearGradient id="kHair" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stopColor="#8a5533" /><stop offset="0.6" stopColor="#5e3520" /><stop offset="1" stopColor="#40220f" /></linearGradient>
        <linearGradient id="kJacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7eddf" /><stop offset="0.6" stopColor="#e6d6bf" /><stop offset="1" stopColor="#c9b394" /></linearGradient>
        <linearGradient id="kPants" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3a3940" /><stop offset="0.5" stopColor="#2a2930" /><stop offset="1" stopColor="#1d1c22" /></linearGradient>
        <linearGradient id="kShoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#cfd0d6" /></linearGradient>
        <radialGradient id="kIris" cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#a8683a" /><stop offset="1" stopColor="#4a2612" /></radialGradient>
        <radialGradient id="kGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffb36b" /><stop offset="1" stopColor="#ff7a1f" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse className="b-shadow" cx="70" cy="193" rx="36" ry="5.5" />
      <g className="b-rig">
        {/* backpack behind the body */}
        <rect x="36" y="92" width="68" height="44" rx="12" fill="#2c2b32" />
        <rect x="98" y="104" width="10" height="22" rx="4" fill="#24232a" />
        {/* legs */}
        <g className="b-legs">
          <rect x="47" y="128" width="21" height="50" rx="8" fill="url(#kPants)" />
          <rect x="72" y="128" width="21" height="50" rx="8" fill="url(#kPants)" />
          <rect x="48" y="146" width="8" height="12" rx="2" fill="#1b1a20" />
          <rect x="84" y="146" width="8" height="12" rx="2" fill="#1b1a20" />
          <path d="M50 150 h5 M85 150 h5" stroke="#ff7a1f" strokeWidth="1.4" />
        </g>
        {/* sneakers */}
        <g className="b-shoes">
          <path d="M40 182 Q40 172 50 172 L64 172 Q70 174 70 183 Q70 189 62 189 L45 189 Q39 189 40 182Z" fill="url(#kShoe)" />
          <path d="M100 182 Q100 172 90 172 L76 172 Q70 174 70 183 Q70 189 78 189 L95 189 Q101 189 100 182Z" fill="url(#kShoe)" />
          <path d="M41 186 L69 186 M71 186 L99 186" stroke="#8d8f99" strokeWidth="2.4" />
          <path d="M50 176 Q57 179 64 175 M90 176 Q83 179 76 175" stroke="#ff7a1f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
        {/* hood behind the neck */}
        <path d="M48 92 Q70 74 92 92 Q82 98 70 98 Q58 98 48 92Z" fill="#cfc8bf" />
        {/* left arm (hangs) */}
        <g className="b-arm b-arm-l">
          <path d="M47 95 Q40 110 39 126" stroke="url(#kJacket)" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M35 124 L44 126" stroke="#2c2b32" strokeWidth="5" strokeLinecap="round" />
          <circle cx="39" cy="132" r="5.6" fill="url(#kSkin)" />
        </g>
        {/* torso: open jacket over a dark hoodie */}
        <path d="M44 98 Q46 88 57 86 L83 86 Q94 88 96 98 L98 134 Q70 141 42 134 Z" fill="url(#kJacket)" />
        <path d="M62 87 L78 87 L77 136 L63 136 Z" fill="#24232a" />
        <path d="M63 88 L63 135 M77 88 L77 135" stroke="#ff7a1f" strokeWidth="1.3" />
        <path d="M66 92 Q70 98 74 92" stroke="#d9d2c8" strokeWidth="1.6" fill="none" />
        <path d="M52 89 L50 128 M88 89 L90 128" stroke="#2c2b32" strokeWidth="5" strokeLinecap="round" />
        <rect x="43" y="128" width="54" height="8" rx="4" fill="#34323a" />
        {/* chest badge: the Surge pulse, glows with the mood */}
        <g className="b-badge">
          <circle className="b-glow" cx="84" cy="106" r="11" fill="url(#kGlow)" />
          <circle cx="84" cy="106" r="5.6" fill="#24232a" />
          <polyline className="b-tip" points="79.5,106.5 81.5,106.5 82.6,103 84.4,109.5 85.6,105.2 86.4,106.5 88.4,106.5" fill="none" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {/* right arm (waves) */}
        <g className="b-arm b-arm-r">
          <path d="M93 95 Q100 110 101 126" stroke="url(#kJacket)" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M96 126 L105 124" stroke="#2c2b32" strokeWidth="5" strokeLinecap="round" />
          <circle cx="101" cy="132" r="5.6" fill="url(#kSkin)" />
        </g>
        {/* head */}
        <g className="b-head">
          <rect x="64" y="76" width="12" height="12" rx="4" fill="#e7a982" />
          <circle cx="40" cy="57" r="6.5" fill="url(#kSkin)" />
          <circle cx="100" cy="57" r="6.5" fill="url(#kSkin)" />
          <ellipse cx="70" cy="54" rx="30" ry="29" fill="url(#kSkin)" />
          {/* hair: messy, with tufts and a swept fringe */}
          <path d="M36 60 Q29 40 38 27 Q43 14 57 11 Q66 3 79 7 Q95 5 103 20 Q111 33 104 60 Q101 49 95 44 Q93 51 85 46 Q80 52 73 43 Q66 51 59 43 Q51 50 46 44 Q40 51 36 60Z" fill="url(#kHair)" />
          <path d="M42 27 Q37 11 51 13 Q51 0 64 6 Q71 -6 81 5 Q94 -2 93 13 Q105 10 100 26 Q89 16 72 17 Q55 16 42 27Z" fill="url(#kHair)" />
          <path d="M39 33 Q27 28 29 42 Q34 37 39 40Z M101 31 Q113 28 111 41 Q106 37 101 39Z" fill="#5e3520" />
          <path d="M47 44 Q55 30 70 33 Q62 36 59 43 Z" fill="#6e4127" />
          <path className="b-cowlick" d="M73 7 Q70 -3 79 -5" stroke="#5e3520" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M50 22 Q60 13 72 16 M82 13 Q92 14 97 23 M44 33 Q48 27 54 26" stroke="#b07a50" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
          {/* brows */}
          <path className="b-brow b-brow-l" d="M51 40.5 Q58 36.5 65 39.5" />
          <path className="b-brow b-brow-r" d="M75 39.5 Q82 36.5 89 40.5" />
          {/* open eyes */}
          <g className="b-eyes">
            <g className="b-eye">
              <ellipse cx="59" cy="57" rx="7.2" ry="8.6" className="b-white" />
              <g className="b-pupil"><circle cx="59" cy="58" r="5.2" fill="url(#kIris)" /><circle cx="59" cy="58" r="2.5" fill="#1a0d06" /><circle cx="57" cy="55.6" r="1.7" className="b-glint" /><circle cx="61" cy="60.5" r="0.8" className="b-glint" /></g>
              <path d="M51.5 53 Q59 45.5 66.5 52" className="b-lid" />
            </g>
            <g className="b-eye">
              <ellipse cx="81" cy="57" rx="7.2" ry="8.6" className="b-white" />
              <g className="b-pupil"><circle cx="81" cy="58" r="5.2" fill="url(#kIris)" /><circle cx="81" cy="58" r="2.5" fill="#1a0d06" /><circle cx="79" cy="55.6" r="1.7" className="b-glint" /><circle cx="83" cy="60.5" r="0.8" className="b-glint" /></g>
              <path d="M73.5 52 Q81 45.5 88.5 53" className="b-lid" />
            </g>
          </g>
          <path className="b-eyes-happy" d="M52 59 Q59 50 66 59 M74 59 Q81 50 88 59" />
          <path className="b-eyes-shut" d="M52 57 Q59 62 66 57 M74 57 Q81 62 88 57" />
          {/* nose, cheeks */}
          <path d="M69.5 63 Q72 66 68.5 67.5" stroke="#d48a62" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <ellipse className="b-cheek" cx="51" cy="67" rx="5.5" ry="3.2" />
          <ellipse className="b-cheek" cx="89" cy="67" rx="5.5" ry="3.2" />
          {/* mouths, one shown per mood */}
          <path className="b-mouth mo-smile" d="M63 72 Q70 77.5 77 72" />
          <path className="b-mouth mo-grin" d="M62 71 Q70 82 78 71 Z" />
          <path className="b-mouth mo-flat" d="M65 74 L75 74" />
          <path className="b-mouth mo-wavy" d="M62.5 75 Q66.2 72 70 75 Q73.8 78 77.5 75" />
          <path className="b-mouth mo-frown" d="M63.5 77 Q70 71 76.5 77" />
          <ellipse className="b-mouth mo-o" cx="70" cy="75" rx="3.6" ry="4.6" />
          <ellipse className="b-mouth mo-sleep" cx="70" cy="75" rx="2.2" ry="1.6" />
          {/* extras */}
          <path className="b-sweat" d="M101 30 Q105 38 101 42 Q97 38 101 30 Z" />
          <path className="b-tear" d="M55 66 Q58 73 55 76 Q52 73 55 66 Z" />
        </g>
        <g className="b-zzz"><text x="100" y="26">z</text><text x="110" y="14">z</text><text x="120" y="2">Z</text></g>
        <g className="b-dots"><circle cx="106" cy="30" r="2.6" /><circle cx="115" cy="22" r="3.2" /><circle cx="125" cy="13" r="3.8" /></g>
        <g className="b-hearts"><path d="M24 34 c-3-4-9-1-6 4 l6 6 6-6 c3-5-3-8-6-4z" /><path d="M116 40 c-2.5-3.5-7.5-1-5 3.3 l5 5 5-5 c2.5-4.3-2.5-6.8-5-3.3z" /></g>
        <g className="b-sparks"><path d="M18 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" /><path d="M122 66 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path d="M112 10 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" /></g>
      </g>
    </svg>
  );
}

/** small head for the tucked-away button */
function KaiFace() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="22" r="14" fill="#f6bf9b" />
      <path d="M6 22 Q5 8 20 6 Q35 8 34 22 Q31 15 26 14 Q22 17 18 14 Q12 17 6 22Z" fill="#5e3520" />
      <ellipse cx="15" cy="23" rx="2.6" ry="3.2" fill="#fff" /><circle cx="15.2" cy="23.4" r="1.8" fill="#4a2612" />
      <ellipse cx="25" cy="23" rx="2.6" ry="3.2" fill="#fff" /><circle cx="25.2" cy="23.4" r="1.8" fill="#4a2612" />
      <path d="M17 29 Q20 31 23 29" stroke="#7a3a1a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
