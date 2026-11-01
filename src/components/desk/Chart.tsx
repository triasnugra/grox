import type { Analysis } from "@/lib/engine/types";
import { px } from "./format";

const W = 640;
const H = 228;

export function Chart({ a }: { a: Analysis }) {
  const k = a.chart;
  if (k.length < 2) return null;
  const bw = W / k.length;
  const pad = 16;
  const levels: Array<[number, string, string]> = [
    [a.H, "rentang atas", "var(--color-muted)"],
    [a.L, "rentang bawah", "var(--color-muted)"],
  ];
  if (a.monL != null) levels.push([a.monL, "Monday low", "var(--color-brass)"]);
  if (a.monH != null) levels.push([a.monH, "Monday high", "var(--color-brass)"]);
  if (a.entry != null) levels.push([a.entry, "entry", "var(--color-brass)"]);
  if (a.sl != null) levels.push([a.sl, "SL", "var(--color-down)"]);
  if (a.tp != null) levels.push([a.tp, "TP", "var(--color-up)"]);
  const mx = Math.max(...k.map((q) => q.h), ...levels.map((x) => x[0]));
  const mn = Math.min(...k.map((q) => q.l), ...levels.map((x) => x[0]));
  const span = mx - mn || 1;
  const y = (v: number) => pad + ((mx - v) / span) * (H - pad * 2);
  const zones: Array<[{ a: number; b: number }, string]> = [
    [a.zoneLong, "var(--color-up)"],
    [a.zoneShort, "var(--color-down)"],
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full rounded-lg bg-bg" role="img" aria-label={`Grafik harian ${a.symbol}`}>
      {zones.map(([z, color], i) => (
        <rect
          key={i}
          x={0}
          y={y(z.b)}
          width={W}
          height={Math.max(2, y(z.a) - y(z.b))}
          fill={color}
          opacity={0.12}
        />
      ))}
      {k.map((q, i) => {
        const x = i * bw + bw / 2;
        const up = q.c >= q.o;
        const color = up ? "var(--color-up)" : "var(--color-down)";
        return (
          <g key={q.t}>
            <line x1={x} x2={x} y1={y(q.h)} y2={y(q.l)} stroke={color} strokeWidth={1} />
            <rect
              x={x - bw * 0.32}
              y={y(Math.max(q.o, q.c))}
              width={Math.max(1, bw * 0.64)}
              height={Math.max(1, Math.abs(y(q.o) - y(q.c)))}
              fill={color}
            />
          </g>
        );
      })}
      {levels.map(([v, label, color]) => (
        <g key={label}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={color} strokeDasharray="4 3" strokeWidth={1} />
          <text x={6} y={Math.max(12, y(v) - 4)} fill={color} fontSize={11} fontFamily="IBM Plex Mono, ui-monospace, monospace">
            {label} {px(v)}
          </text>
        </g>
      ))}
      {a.tl
        ? (() => {
            const x1 = ((Math.max(a.tl.a, a.chartOff) - a.chartOff + 0.5) * bw);
            const x2 = ((a.tl.e - a.chartOff + 0.5) * bw);
            const yAt = (i: number) => y(a.tl!.av + a.tl!.sl * (i - a.tl!.a));
            return (
              <line
                x1={x1}
                y1={yAt(Math.max(a.tl.a, a.chartOff))}
                x2={x2}
                y2={yAt(a.tl.e)}
                stroke="var(--color-brass)"
                strokeWidth={2}
              />
            );
          })()
        : null}
    </svg>
  );
}
