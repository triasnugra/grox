import { divergence, ema, obv, rsi, sgn } from "./math.ts";
import type { Analysis, Candidate, Candle, Side, TrendLine, TrigId } from "./types.ts";

const emptyZone = { a: 0, b: 0 };

function ageOf(index: number, n: number): number {
  if (index >= n) return 0;
  return Math.max(0, n - 1 - index);
}

function bandEntry(c: number[], level: number, n: number, inside: (px: number) => boolean): number {
  if (!inside(c[n - 1] ?? 0)) return -1;
  let i = n - 1;
  while (i > 0 && inside(c[i - 1] ?? 0)) i--;
  return i;
}

/**
 * Fitur harian + rencana mesin lama, plus pemicu yang masih segar.
 * Keputusan di harga open hari ini (candle sintetis), sama seperti mesin yang berjalan.
 */
export function analyze(k: Candle[], qv: number, analyzedAt = Date.now(), symbol = ""): Analysis {
  const x = k.slice(0, -1);
  const c = x.map((q) => q.c);
  const n = x.length;
  const cur = k.at(-1)!;
  const px = cur.c;
  if (n < 120) throw new Error("data kurang dari 120 hari");

  const E20 = ema(c, 20)[n - 1] ?? px;
  const E50 = ema(c, 50)[n - 1] ?? px;
  const td = sgn(px, E20, E50);

  const wm = new Map<number, { c: number; l: number; h: number }>();
  for (const q of x) {
    const i = Math.floor((q.t - 4 * 864e5) / (7 * 864e5));
    const o = wm.get(i) || { c: q.c, l: 1e18, h: 0 };
    wm.set(i, { c: q.c, l: Math.min(o.l, q.l), h: Math.max(o.h, q.h) });
  }
  const wv = [...wm.values()].slice(0, -1);
  const wc = wv.map((w) => w.c);
  const m = wc.length;
  const wlow = Math.min(...wv.slice(-26).map((w) => w.l));
  const whigh = Math.max(...wv.slice(-26).map((w) => w.h));
  let tw: Side = 0;
  let flip = false;
  if (m >= 55) {
    const a = ema(wc, 20);
    const b = ema(wc, 50);
    tw = sgn(px, a[m - 1] ?? px, b[m - 1] ?? px);
    const prev = sgn(wc[m - 4] ?? px, a[m - 4] ?? px, b[m - 4] ?? px);
    const now = sgn(wc[m - 1] ?? px, a[m - 1] ?? px, b[m - 1] ?? px);
    flip = prev !== now;
  }
  const tr: Side = m >= 55 ? tw : td;

  const R = rsi(c);
  const dO = divergence(c, obv(x));
  const dR = divergence(c, R);
  const pr = x.slice(n - 65, n - 5);
  const H = Math.max(...pr.map((q) => q.h));
  const L = Math.min(...pr.map((q) => q.l));
  const span = H - L || 1e-9;
  const pos = (px - L) / span;
  const mid = pos > 0.3 && pos < 0.7;
  const flat = span / L < 0.06;
  const atr =
    x.slice(n - 14).reduce((s, q, i, a) => {
      const prevC = i ? a[i - 1]!.c : q.c;
      return s + Math.max(q.h - q.l, Math.abs(q.h - prevC), Math.abs(q.l - prevC));
    }, 0) / 14;
  const bd = Math.min(0.6 * atr, span / 4);
  const zoneLong = { a: L, b: L + bd };
  const zoneShort = { a: H - bd, b: H };

  const devUpIdx = (() => {
    let idx = -1;
    for (let i = n - 5; i < n; i++) if (x[i]!.l < L && x[i]!.c > L) idx = i;
    return idx;
  })();
  const devDnIdx = (() => {
    let idx = -1;
    for (let i = n - 5; i < n; i++) if (x[i]!.h > H && x[i]!.c < H) idx = i;
    return idx;
  })();
  const devUp = px > L && devUpIdx >= 0;
  const devDn = px < H && devDnIdx >= 0;

  let boUpIdx = -1;
  let boDnIdx = -1;
  for (let i = n - 10; i < n; i++) {
    if (x[i]!.c > H) boUpIdx = i;
    if (x[i]!.c < L) boDnIdx = i;
  }
  const boUp = boUpIdx >= 0 && px > H && px < H * 1.03;
  const boDn = boDnIdx >= 0 && px < L && px > L * 0.97;

  const w60 = x.slice(n - 60);
  const hh = Math.max(...w60.map((q) => q.h));
  const lo = Math.min(...w60.map((q) => q.l));
  const f75 = tr >= 0 ? hh - 0.75 * (hh - lo) : lo + 0.75 * (hh - lo);
  const inFib = (p: number) => Math.abs(p - f75) / p < 0.03;
  const nf = inFib(px);
  const fibIdx = nf ? bandEntry(c, f75, n, inFib) : -1;

  let mI = -1;
  for (let i = n - 1; i >= n - 7; i--) {
    if (new Date(x[i]!.t).getUTCDay() === 1) {
      mI = i;
      break;
    }
  }
  const monL = mI >= 0 ? x[mI]!.l : null;
  const monH = mI >= 0 ? x[mI]!.h : null;
  let monUpHist = -1;
  let monDnHist = -1;
  if (mI >= 0 && monL !== null && monH !== null) {
    for (let i = mI + 1; i < n; i++) {
      if (x[i]!.l < monL && x[i]!.c > monL) monUpHist = i;
      if (x[i]!.h > monH && x[i]!.c < monH) monDnHist = i;
    }
  }
  const gapUp = monL !== null && cur.l < monL;
  const gapDn = monH !== null && cur.h > monH;
  const monUpIdx = gapUp ? n : monUpHist;
  const monDnIdx = gapDn ? n : monDnHist;
  const mDevUp = monL !== null && px > monL && monUpIdx >= 0;
  const mDevDn = monH !== null && px < monH && monDnIdx >= 0;

  const hs = x.map((q) => q.h);
  const ls = x.map((q) => q.l);
  const pv = (a: number[], i: number, hi: boolean) => {
    for (let j = i - 3; j <= i + 3; j++) if (j !== i && (hi ? a[j]! > a[i]! : a[j]! < a[i]!)) return false;
    return true;
  };
  const PH: number[] = [];
  const PL: number[] = [];
  for (let i = n - 90; i < n - 3; i++) {
    if (pv(hs, i, true)) PH.push(i);
    if (pv(ls, i, false)) PL.push(i);
  }
  const tl = (P: number[], a_: number[], desc: boolean): TrendLine | null => {
    if (P.length < 2) return null;
    const a = P.at(-2)!;
    const b = P.at(-1)!;
    if (b - a < 5 || (desc ? a_[b]! >= a_[a]! : a_[b]! <= a_[a]!)) return null;
    return { a, av: a_[a]!, sl: (a_[b]! - a_[a]!) / (b - a), e: n };
  };
  const TH = tl(PH, hs, true);
  const TL = tl(PL, ls, false);
  const line = (T: TrendLine, i: number) => T.av + T.sl * (i - T.a);
  const lastBreak = (T: TrendLine | null, a_: number[], up: boolean) => {
    if (!T) return -1;
    for (let j = 0; j <= 4; j++) {
      const i = n - 1 - j;
      if (up ? a_[i]! > line(T, i) : a_[i]! < line(T, i)) return i;
    }
    return -1;
  };
  const wolfDnIdx = lastBreak(TH, hs, true);
  const wolfUpIdx = lastBreak(TL, ls, false);
  const wDn = !!TH && wolfDnIdx >= 0 && px < line(TH, n) && c[n - 1]! < line(TH, n - 1);
  const wUp = !!TL && wolfUpIdx >= 0 && px > line(TL, n) && c[n - 1]! > line(TL, n - 1);

  const tL = PL.filter((i) => i >= n - 65 && i < n - 5 && ls[i]! <= L * 1.02).length;
  const tH = PH.filter((i) => i >= n - 65 && i < n - 5 && hs[i]! >= H * 0.98).length;

  const Zs = Math.min(...c.slice(n - 90));
  const Zh = Math.max(...c.slice(n - 90));
  const swp = (a_: number[], z: number, up: boolean) => {
    const S: number[] = [];
    for (let i = n - 60; i < n; i++) {
      if (up ? a_[i]! < z * 0.998 && c[i]! > z : a_[i]! > z * 1.002 && c[i]! < z) {
        if (!S.length || i - S.at(-1)! >= 3) S.push(i);
      }
    }
    return S;
  };
  const sU = swp(ls, Zs, true);
  const sD = swp(hs, Zh, false);
  const ddUp = sU.length >= 2 && sU.at(-1)! >= n - 10 && ls[sU.at(-1)!]! > ls[sU.at(-2)!]! && px > Zs;
  const ddDn = sD.length >= 2 && sD.at(-1)! >= n - 10 && hs[sD.at(-1)!]! < hs[sD.at(-2)!]! && px < Zh;

  const prevC = c[n - 2] ?? px;
  const zUpNow = tr === 1 && tL >= 2 && px >= L && px <= L + bd * 1.5 && !devUp;
  const zDnNow = tr === -1 && tH >= 2 && px <= H && px >= H - bd * 1.5 && !devDn;
  const prevZUp = prevC >= L && prevC <= L + bd * 1.5;
  const prevZDn = prevC <= H && prevC >= H - bd * 1.5;
  const zUpIdx = zUpNow ? (prevZUp ? n - 2 : n - 1) : -1;
  const zDnIdx = zDnNow ? (prevZDn ? n - 2 : n - 1) : -1;

  const tags: string[] = [];
  if (devUp) tags.push(tL >= 2 ? "Three Tap" : "Deviasi bawah");
  if (devDn) tags.push(tH >= 2 ? "Three Top" : "Deviasi atas");
  if (boUp || boDn) tags.push("Breakout-retest");
  if (ddUp || ddDn) tags.push("Double Deviation");
  if (zUpNow || zDnNow) tags.push("Retest zona kuat");
  if (mDevUp) tags.push("Sweep Monday Low");
  if (mDevDn) tags.push("Sweep Monday High");
  if (wDn) tags.push("Wolf bearish");
  if (wUp) tags.push("Wolf bullish");

  const longBits: Array<{ on: boolean; id: TrigId; index: number; label: string }> = [
    { on: ddUp, id: "dd", index: sU.at(-1) ?? -1, label: "Double Deviation: sweep ke-2 lebih dangkal, tekanan jual melemah" },
    { on: zUpNow, id: "zone", index: zUpIdx, label: "retest zona demand kuat (2+ sentuhan, searah tren)" },
    {
      on: devUp,
      id: "dev",
      index: devUpIdx,
      label: tL >= 2 ? "Three Tap: 2 sentuhan lalu manipulasi di bawah" : "deviasi bawah lalu recovery",
    },
    { on: mDevUp, id: "mon", index: monUpIdx, label: "sweep Monday Low lalu reclaim" },
    { on: boUp, id: "bo", index: boUpIdx, label: "breakout ber-close, retest" },
    { on: wUp, id: "wolf", index: wolfUpIdx, label: "Wolf bullish: breakdown trendline gagal" },
    { on: tr === 1 && nf, id: "fib", index: fibIdx, label: "Fib 0.75 tren naik" },
  ];
  const shortBits: Array<{ on: boolean; id: TrigId; index: number; label: string }> = [
    { on: ddDn, id: "dd", index: sD.at(-1) ?? -1, label: "Double Deviation: sweep ke-2 lebih dangkal, tekanan beli melemah" },
    { on: zDnNow, id: "zone", index: zDnIdx, label: "retest zona supply kuat (2+ sentuhan, searah tren)" },
    {
      on: devDn,
      id: "dev",
      index: devDnIdx,
      label: tH >= 2 ? "Three Top: 2 sentuhan lalu manipulasi di atas" : "deviasi atas gagal bertahan",
    },
    { on: mDevDn, id: "mon", index: monDnIdx, label: "sweep Monday High lalu reclaim" },
    { on: boDn, id: "bo", index: boDnIdx, label: "breakdown ber-close, retest" },
    { on: wDn, id: "wolf", index: wolfDnIdx, label: "Wolf: breakout trendline gagal" },
    { on: tr === -1 && nf, id: "fib", index: fibIdx, label: "Fib 0.75 tren turun" },
  ];

  const toCand = (b: (typeof longBits)[number]): Candidate => ({
    id: b.id,
    index: b.index,
    age: ageOf(b.index, n),
    label: b.label,
  });

  const lw = longBits.filter((b) => b.on);
  const sw = shortBits.filter((b) => b.on);
  let side: Side = 0;
  let bits = lw;
  if (lw.length && (!sw.length || lw.length > sw.length)) {
    side = 1;
    bits = lw;
  } else if (sw.length) {
    side = -1;
    bits = sw;
  }
  if (side === -1 && tr === 1 && !devDn && !wDn && !mDevDn && !ddDn) side = 0;
  if (side === 1 && tr === -1 && !devUp && !boUp && !wUp && !mDevUp && !ddUp) side = 0;
  if (side && mid && !(side === 1 ? devUp || mDevUp || ddUp : devDn || mDevDn || ddDn)) side = 0;
  if (flat) side = 0;
  if (!side) bits = [];

  const cands = bits.map(toCand);
  const legacy = cands[0] ?? null;
  const fresh = cands.find((q) => q.age === 0) ?? null;
  const chosen = fresh ?? legacy;

  const confirms = (s: Side, structural: string[]) => {
    const why = [...structural];
    if (dO === s && qv >= 2e7) why.push("OBV divergence");
    else if (dO === s && qv < 2e7) why.push("OBV divergence (volume tipis, diabaikan)");
    if (dR === s) why.push("RSI divergence");
    if (tr === s) why.push("searah tren");
    return why;
  };

  const legacyWhy = side ? confirms(side, cands.map((q) => q.label)) : [];

  let entry: number | null = null;
  let sl: number | null = null;
  let tp: number | null = null;
  let t2: number | null = null;
  let slp: number | null = null;
  let dist: number | null = null;
  let planType: string | null = null;
  let planTl: TrendLine | null = null;
  let activeWhy: string[] = [];
  let tpAlreadyHit = false;
  let entryAfterTp = false;

  if (side && chosen) {
    const trig = chosen.id;
    const useFreshOnly = fresh !== null;
    const structural = (useFreshOnly ? cands.filter((q) => q.age === 0) : cands).map((q) => q.label);
    activeWhy = confirms(side, structural);
    const lvl =
      side === 1
        ? trig === "dd"
          ? Zs
          : trig === "dev"
            ? L
            : trig === "mon"
              ? (monL ?? px)
              : trig === "zone"
                ? L + bd
                : trig === "bo"
                  ? H
                  : trig === "wolf"
                    ? TL
                      ? line(TL, n)
                      : px
                    : f75
        : trig === "dd"
          ? Zh
          : trig === "dev"
            ? H
            : trig === "mon"
              ? (monH ?? px)
              : trig === "zone"
                ? H - bd
                : trig === "bo"
                  ? L
                  : trig === "wolf"
                    ? TH
                      ? line(TH, n)
                      : px
                    : f75;
    entry = side === 1 ? Math.min(lvl, px) : Math.max(lvl, px);
    const rec = x.slice(n - 5);
    if (trig === "fib") sl = entry * (1 - side * 0.05);
    else if (trig === "dd") sl = side === 1 ? ls[sU.at(-1)!]! * 0.995 : hs[sD.at(-1)!]! * 1.005;
    else if (trig === "zone") sl = side === 1 ? L * 0.99 : H * 1.01;
    else if (side === 1) sl = Math.min(...rec.map((q) => q.l), cur.l) * 0.995;
    else sl = Math.max(...rec.map((q) => q.h), cur.h) * 1.005;
    sl = side === 1 ? Math.min(sl, entry * 0.97) : Math.max(sl, entry * 1.03);
    const risk = Math.abs(entry - sl);
    slp = (risk / entry) * 100;
    const rangeTarget = side === 1 ? H : L;
    const rrRange = risk > 0 ? Math.abs(rangeTarget - entry) / risk : 0;
    planType =
      slp <= 5 ? "scalping" : slp <= 15 ? "swing" : slp <= 30 && rrRange >= 3 ? "spot (SL lebar)" : "ditolak";
    tp = entry + side * 2 * risk;
    t2 = rangeTarget;
    dist = (Math.abs(px - entry) / px) * 100;
    if (trig === "wolf") {
      const T = side === 1 ? TL : TH;
      if (T) planTl = T;
    }
    const recent = x.slice(-3);
    tpAlreadyHit = recent.some((b) => (side === 1 ? b.h >= tp! : b.l <= tp!));
    const w10 = x.slice(-10);
    let tpAt = -1;
    for (let i = 0; i < w10.length; i++) {
      const hitTp = side === 1 ? w10[i]!.h >= tp! : w10[i]!.l <= tp!;
      const hitEn = side === 1 ? w10[i]!.l <= entry : w10[i]!.h >= entry;
      if (tpAt < 0 && hitTp) tpAt = i;
      else if (tpAt >= 0 && i > tpAt && hitEn) entryAfterTp = true;
    }
  }

  return {
    symbol,
    analyzedAt,
    px,
    tr,
    td,
    tw,
    weeks: m,
    flip,
    e20: E20,
    e50: E50,
    rsi: R[n - 1] ?? null,
    obvDiv: dO,
    rsiDiv: dR,
    ret30: px / (c[n - 30] ?? px) - 1,
    tags,
    chart: k.slice(-90),
    chartOff: k.length - 90,
    H,
    L,
    zoneLong,
    zoneShort,
    wlow,
    whigh,
    monL,
    monH,
    pos,
    mid,
    flat,
    qv,
    closed: n,
    devUp,
    devDn,
    ddUp,
    ddDn,
    mDevUp,
    mDevDn,
    wUp,
    wDn,
    boUp,
    boDn,
    zUp: zUpNow,
    zDn: zDnNow,
    legacySide: side,
    legacyWhy,
    legacyTrig: legacy?.id ?? null,
    legacyAge: legacy?.age ?? 0,
    fresh,
    staleIgnored: cands.filter((q) => q.age > 0),
    entry,
    sl,
    tp,
    t2,
    slp,
    dist,
    planType,
    tl: planTl,
    activeWhy,
    activeTrig: chosen?.id ?? null,
    activeAge: chosen?.age ?? 0,
    tpAlreadyHit,
    entryAfterTp,
  };
}
