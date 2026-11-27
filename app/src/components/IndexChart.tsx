"use client";
// Why: the index is a time series; people need to see where it is now
//      relative to the last minutes and whether a spike is building, and
//      they should see it move, not jump, when a new value lands.
// How: TradingView's lightweight-charts (canvas, ~45 KB) draws a curved
//      area series with a crosshair, pan/zoom and a pulsing last point.
//      Full history is loaded with setData only when it really changes
//      (first load, backfill, series switch). A single new update is
//      animated instead: a new point is added at the old value and eased to
//      the new value over ~0.9 s with series.update() each frame, so the line,
//      the last-price label and the auto-scaled axis glide into place.
//      Colours come from the CSS theme tokens and follow light/dark switches.
import { useEffect, useRef, useState } from "react";
import {
  AreaSeries, ColorType, CrosshairMode, LastPriceAnimationMode, LineType, createChart,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { IndexPoint } from "./SurgeData";
import { indexSol, times } from "@/lib/format";

export type Series = "index" | "priority" | "tips";
const LABEL: Record<Series, string> = { index: "Combined", priority: "Priority fees", tips: "Jito tips" };
const TWEEN_MS = 900;

type Pt = { time: UTCTimestamp; value: number };

/** one point per second, ascending (the library requires unique, sorted times) */
function toData(points: IndexPoint[], s: Series): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const time = Math.floor(p.t / 1000) as UTCTimestamp;
    const v = p[s];
    if (out.length && out[out.length - 1].time >= time) {
      if (out[out.length - 1].time === time) out[out.length - 1] = { time, value: v };
      continue;
    }
    out.push({ time, value: v });
  }
  return out;
}

function css(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function alpha(hex: string, a: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function themeOptions() {
  const orange = css("--orange", "#ff7518");
  return {
    chart: {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--muted", "#5e666b"), fontFamily: css("--font-mono", "ui-monospace, monospace"), fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line-2", "#f1ecdc") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: alpha(css("--ink", "#0b1215"), 0.35), labelBackgroundColor: css("--ink", "#0b1215") },
        horzLine: { color: alpha(css("--ink", "#0b1215"), 0.25), labelBackgroundColor: orange },
      },
    },
    series: { lineColor: orange, topColor: alpha(orange, 0.3), bottomColor: alpha(orange, 0), crosshairMarkerBackgroundColor: orange, crosshairMarkerBorderColor: css("--card", "#ffffff") },
  };
}

/** axis labels: hh:mm on whole minutes, hh:mm:ss between them (so 30 s ticks don't repeat a label) */
const clock = (sec: number) => {
  const d = new Date(sec * 1000);
  return d.toLocaleTimeString([], d.getSeconds() ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
};

export function IndexChart({ points, height = 300, showToggle = true }: { points: IndexPoint[]; height?: number; showToggle?: boolean }) {
  const [series, setSeries] = useState<Series>("index");
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const area = useRef<ISeriesApi<"Area"> | null>(null);
  const shown = useRef<Pt[]>([]); // what the chart currently holds (final values)
  const raf = useRef(0);
  const [tip, setTip] = useState<Pt | null>(null);
  const empty = points.length < 2;

  // create once
  useEffect(() => {
    if (!box.current || empty) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = themeOptions();
    const c = createChart(box.current, {
      ...t.chart,
      autoSize: true,
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      localization: { timeFormatter: (s: number) => new Date(s * 1000).toLocaleTimeString(), priceFormatter: (v: number) => indexSol(v) },
      timeScale: { ...t.chart.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 3, tickMarkFormatter: (s: number) => clock(s) },
      rightPriceScale: { ...t.chart.rightPriceScale, scaleMargins: { top: 0.14, bottom: 0.08 } },
      crosshair: { ...t.chart.crosshair, mode: CrosshairMode.Magnet },
    });
    const s = c.addSeries(AreaSeries, {
      ...t.series,
      lineWidth: 2,
      lineType: LineType.Curved,
      priceLineVisible: true,
      priceLineStyle: 2,
      priceLineColor: t.series.lineColor,
      lastPriceAnimation: reduce ? LastPriceAnimationMode.Disabled : LastPriceAnimationMode.Continuous,
      crosshairMarkerRadius: 5,
      priceFormat: { type: "custom", minMove: 1, formatter: (v: number) => indexSol(v) },
    });
    c.subscribeCrosshairMove((p) => {
      const d = p.time != null ? (p.seriesData.get(s) as Pt | undefined) : undefined;
      setTip(d && typeof d.value === "number" ? { time: p.time as UTCTimestamp, value: d.value } : null);
    });
    chart.current = c;
    area.current = s;

    // follow theme switches (data-theme on <html>, or the OS setting)
    const retheme = () => { const n = themeOptions(); c.applyOptions(n.chart); s.applyOptions({ ...n.series, priceLineColor: n.series.lineColor }); };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", retheme);

    return () => {
      cancelAnimationFrame(raf.current);
      mo.disconnect();
      mq.removeEventListener("change", retheme);
      c.remove();
      chart.current = null;
      area.current = null;
      shown.current = [];
    };
  }, [empty]);

  // feed data: full reload when history really changed, a tween when one point was appended
  useEffect(() => {
    const s = area.current, c = chart.current;
    if (!s || !c) return;
    const next = toData(points, series);
    const prev = shown.current;
    const appendedOne = prev.length > 0 && next.length >= 2
      && next[next.length - 2].time === prev[prev.length - 1].time
      && next[next.length - 1].time > prev[prev.length - 1].time
      && next.length - prev.length <= 1;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(raf.current);

    if (!appendedOne || reduce) {
      s.setData(next);
      shown.current = next;
      if (prev.length === 0) c.timeScale().fitContent();
      return;
    }

    // ease the new point in from the previous value
    const from = prev[prev.length - 1].value;
    const target = next[next.length - 1];
    shown.current = next;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / TWEEN_MS);
      const e = 1 - Math.pow(1 - k, 3);
      try { s.update({ time: target.time, value: from + (target.value - from) * e }); } catch { return; }
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [points, series]);

  return (
    <div className="chart">
      {showToggle && (
        <div className="chart-head">
          <div className="seg" role="tablist" aria-label="Series">
            {(Object.keys(LABEL) as Series[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={series === s} className={series === s ? "on" : ""} onClick={() => setSeries(s)}>{LABEL[s]}</button>
            ))}
          </div>
          <span className="muted small">{points.length} updates</span>
        </div>
      )}
      <div className="chart-box" style={{ height }} role="img" aria-label={`${LABEL[series]} index over the last ${points.length} updates`}>
        {empty ? (
          <div className="chart-empty">Waiting for index updates…</div>
        ) : (
          <div ref={box} className="chart-canvas" />
        )}
        {tip && (
          <div className="chart-tip mono">
            {indexSol(tip.value)} SOL/slot · {times(tip.value)}
            <span className="muted"> · {new Date(tip.time * 1000).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
