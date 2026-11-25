"use client";
// Why: live numbers that jump from one value to the next are hard to follow;
//      a short roll plus a green/red flash shows at a glance what moved and which way.
// How: tweens from the previous value to the new one over ~650 ms with
//      requestAnimationFrame (ease-out), formats every frame with `format`, and
//      adds an up/down class for a moment so CSS can flash the colour. With
//      reduced motion it just swaps the value.
import { useEffect, useRef, useState } from "react";

export function Num({ value, format, className = "" }: { value: number; format: (v: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<"" | "up" | "down">("");
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setDir(value > start ? "up" : "down");
    const flash = setTimeout(() => setDir(""), 900);
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(value); from.current = value; return () => clearTimeout(flash); }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 650);
      const e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf.current); clearTimeout(flash); };
  }, [value]);

  return <span className={`num ${dir ? "num-" + dir : ""} ${className}`}>{format(shown)}</span>;
}
