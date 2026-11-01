import type { JournalRow, JournalStatus } from "./types.ts";

type Bar = { ot: number; o: number; h: number; l: number; c: number; ct: number };

const rules = (r: { arah: "LONG" | "SHORT"; entry: number; sl: number; tp: number }) => {
  const s = r.arah === "LONG" ? 1 : -1;
  return {
    s,
    touch: (k: Bar) => (s === 1 ? k.l <= r.entry : k.h >= r.entry),
    open: (k: Bar) => (s === 1 ? k.o <= r.entry : k.o >= r.entry),
    sl: (k: Bar) => (s === 1 ? k.l <= r.sl : k.h >= r.sl),
    tp: (k: Bar) => (s === 1 ? k.h >= r.tp : k.l <= r.tp),
  };
};

function walk(cs: Bar[], P: ReturnType<typeof rules>, st: { fill: boolean }) {
  for (const k of cs) {
    if (!st.fill) {
      const ao = P.open(k);
      if (!ao && !P.touch(k)) continue;
      st.fill = true;
      if (P.sl(k)) return { res: "SL" as const, t: k.ot };
      if (ao && P.tp(k)) return { res: "TP" as const, t: k.ot };
      continue;
    }
    if (P.sl(k)) return { res: "SL" as const, t: k.ot };
    if (P.tp(k)) return { res: "TP" as const, t: k.ot };
  }
  return null;
}

export type Grade = { hasil: JournalStatus; R: number; t: number } | null;

/** Penilaian yang sama dengan jurnal lama: SL didahulukan bila urutan dalam satu jam tidak diketahui. */
export async function gradeTrade(
  r: { arah: "LONG" | "SHORT"; entry: number; sl: number; tp: number; t: number; due: number },
  src: {
    h1: () => Promise<Bar[]>;
    m1?: (from: number, to: number) => Promise<Bar[]>;
    now?: number;
  },
): Promise<Grade> {
  const P = rules(r);
  const risk = Math.abs(r.entry - r.sl);
  const st = { fill: false };
  const now = src.now ?? Date.now();
  if (!(risk > 0)) return { hasil: "tidak valid", R: 0, t: r.t };
  const done = (w: { res: "TP" | "SL"; t: number }) => ({
    hasil: w.res as JournalStatus,
    R: w.res === "SL" ? -1 : (P.s * (r.tp - r.entry)) / risk,
    t: w.t,
  });
  const cs = (await src.h1()).filter((k) => k.ct < now);
  if (cs.length && cs[0]!.ot < r.t) {
    const k0 = cs.shift()!;
    if (src.m1) {
      const ms = (await src.m1(Math.max(k0.ot, r.t), k0.ct)).filter((m) => m.ot >= r.t);
      const w = walk(ms, P, st);
      if (w) return done(w);
    }
  }
  let last: Bar | null = null;
  for (const k of cs) {
    if (k.ct > r.due) break;
    last = k;
    const amb = st.fill ? P.sl(k) && P.tp(k) : (P.touch(k) || P.open(k)) && (P.sl(k) || P.tp(k));
    const w = amb && src.m1 ? walk(await src.m1(k.ot, k.ct), P, st) : walk([k], P, st);
    if (w) return done(w);
  }
  if (now < r.due) return null;
  if (!st.fill) return { hasil: "tidak terisi", R: 0, t: r.due };
  return { hasil: "kedaluwarsa", R: (P.s * ((last ? last.c : r.entry) - r.entry)) / risk, t: r.due };
}

export function mapK(a: number[]): Bar {
  return { ot: +a[0]!, o: +a[1]!, h: +a[2]!, l: +a[3]!, c: +a[4]!, ct: +a[6]! };
}

export function isActive(row: JournalRow, now = Date.now()): boolean {
  return row.hasil === "menunggu" && now < row.due;
}
