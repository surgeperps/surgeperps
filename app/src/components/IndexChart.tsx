"use client";
// Why: the index is a time series; people need to see where it is now
//      relative to the last minutes and whether a spike is building.
// How: a hand-drawn SVG line + area chart sized to its container (so text
//      stays crisp), with a toggle between the combined index and the two
//      sub-indices, a faint grid, an emphasised last point and a hover readout.
import { useEffect, useMemo, useRef, useState } from "react";
import type { IndexPoint } from "./SurgeData";
import { indexSol, times } from "@/lib/format";

export type Series = "index" | "priority" | "tips";
const LABEL: Record<Series, string> = { index: "Combined", priority: "Priority fees", tips: "Jito tips" };

export function IndexChart({ points, height = 300, showToggle = true }: { points: IndexPoint[]; height?: number; showToggle?: boolean }) {
  const [series, setSeries] = useState<Series>("index");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 8, r: 64, t: 12, b: 26 };
  const data = points.map((p) => ({ t: p.t, v: p[series] }));
  const { path, area, ticks, xy, min, max } = useMemo(() => {
    if (data.length < 2) return { path: "", area: "", ticks: [] as number[], xy: [] as [number, number][], min: 0, max: 0 };
    let lo = Math.min(...data.map((d) => d.v)), hi = Math.max(...data.map((d) => d.v));
    const span = hi - lo || hi * 0.05 || 1;
    lo -= span * 0.12; hi += span * 0.12;
    const t0 = data[0].t, t1 = data[data.length - 1].t || t0 + 1;
    const X = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
    const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
    const xy = data.map((d) => [X(d.t), Y(d.v)] as [number, number]);
    const path = "M" + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
    const area = `${path} L${xy[xy.length - 1][0].toFixed(1)},${height - pad.b} L${xy[0][0].toFixed(1)},${height - pad.b} Z`;
    const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * (i + 0.5)) / 4);
    return { path, area, ticks, xy, min: lo, max: hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, series, w, height]);

  const Y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const last = xy[xy.length - 1];
  const hp = hover !== null ? data[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!xy.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < xy.length; i++) if (Math.abs(xy[i][0] - x) < Math.abs(xy[best][0] - x)) best = i;
    setHover(best);
  }

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
      <div ref={box} className="chart-box" style={{ height }}>
        {xy.length < 2 ? (
          <div className="chart-empty">Waiting for index updates…</div>
        ) : (
          <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${LABEL[series]} index over the last ${points.length} updates`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="grid" />
                <text x={w - pad.r + 8} y={Y(v) + 4} className="axis">{indexSol(v)}</text>
              </g>
            ))}
            <path d={area} className="area" />
            <path d={path} className="line" />
            {last && <circle cx={last[0]} cy={last[1]} r={5} className="dot" />}
            {hp && hover !== null && (
              <g>
                <line x1={xy[hover][0]} x2={xy[hover][0]} y1={pad.t} y2={height - pad.b} className="cross" />
                <circle cx={xy[hover][0]} cy={xy[hover][1]} r={4} className="dot" />
              </g>
            )}
            <text x={pad.l} y={height - 6} className="axis">{new Date(data[0].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>
            <text x={w - pad.r} y={height - 6} className="axis" textAnchor="end">{new Date(data[data.length - 1].t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</text>
          </svg>
        )}
        {hp && (
          <div className="chart-tip mono">
            {indexSol(hp.v)} SOL/slot · {times(hp.v)}
            <span className="muted"> · {new Date(hp.t).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
