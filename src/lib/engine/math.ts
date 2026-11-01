import type { Candle, Side } from "./types.ts";

export const DAY = 864e5;

export function ema(a: number[], n: number): number[] {
  const k = 2 / (n + 1);
  let e = a[0] ?? 0;
  return a.map((v) => (e = v * k + e * (1 - k)));
}

export function rsi(c: number[], n = 14): Array<number | null> {
  let g = 0;
  let l = 0;
  return c.map((v, i) => {
    if (!i) return null;
    const d = v - (c[i - 1] ?? v);
    const u = Math.max(d, 0);
    const w = Math.max(-d, 0);
    if (i <= n) {
      g += u / n;
      l += w / n;
    } else {
      g = (g * (n - 1) + u) / n;
      l = (l * (n - 1) + w) / n;
    }
    return i < n ? null : 100 - 100 / (1 + g / (l || 1e-9));
  });
}

export function obv(k: Candle[]): number[] {
  let o = 0;
  return k.map((x, i) => {
    const prev = k[i - 1];
    if (prev) o += x.c > prev.c ? x.v : x.c < prev.c ? -x.v : 0;
    return o;
  });
}

export function divergence(p: number[], d: Array<number | null>): Side {
  const n = p.length;
  const ix = (a: number, b: number, f: (v: number, m: number) => boolean) => {
    let j = a;
    for (let i = a; i < b; i++) {
      const vi = p[i];
      const vj = p[j];
      if (vi !== undefined && vj !== undefined && f(vi, vj)) j = i;
    }
    return j;
  };
  const l1 = ix(n - 15, n, (v, m) => v < m);
  const l0 = ix(n - 30, n - 15, (v, m) => v < m);
  const h1 = ix(n - 15, n, (v, m) => v > m);
  const h0 = ix(n - 30, n - 15, (v, m) => v > m);
  const at = (arr: Array<number | null>, i: number) => arr[i] ?? null;
  const dl1 = at(d, l1);
  const dl0 = at(d, l0);
  const dh1 = at(d, h1);
  const dh0 = at(d, h0);
  const pl1 = p[l1] ?? 0;
  const pl0 = p[l0] ?? 0;
  const ph1 = p[h1] ?? 0;
  const ph0 = p[h0] ?? 0;
  if (dl1 !== null && dl0 !== null && pl1 < pl0 && dl1 > dl0) return 1;
  if (dh1 !== null && dh0 !== null && ph1 > ph0 && dh1 < dh0) return -1;
  return 0;
}

export function sgn(p: number, a: number, b: number): Side {
  if (p > b && a > b) return 1;
  if (p < b && a < b) return -1;
  return 0;
}

/** Candle harian yang sudah tutup + candle hari ini berisi harga open saja. */
export function scanInput(k: Candle[], now = Date.now()) {
  const closed = k.filter((q) => q.t + DAY <= now);
  const forming = k.find((q) => q.t + DAY > now);
  const last = closed.at(-1);
  if (!last || !forming) throw new Error("kline tidak lengkap untuk scan");
  const o = forming.o;
  return {
    bars: [...closed.slice(-999), { t: forming.t, o, h: o, l: o, c: o, v: 0 }],
    qv: last.v * last.c,
    analyzedAt: now,
  };
}
