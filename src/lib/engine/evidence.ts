/** Angka monitor per 28 Oktober 2026. Dipakai sebagai bukti gerbang, bukan sebagai ramalan. */
export const EVIDENCE_ASOF = "28 Oktober 2026";

export const MACHINE = {
  setups: 259,
  triggered: 90,
  tp: 17,
  sl: 48,
  pending: 48,
  expired: 146,
  invalid: 0,
  win: 0.262,
  winLo: 0.17,
  winHi: 0.38,
  n: 65,
  expR: -0.22,
  totalR: -14,
  maxDd: 22,
} as const;

export const DIRECTION = [
  { side: "LONG", n: 43, win: 0.07, expR: -0.79, totalR: -34 },
  { side: "SHORT", n: 22, win: 0.636, expR: 0.91, totalR: 20 },
] as const;

/** Satu keluarga pola. Jumlah R = −32. Itu lebih besar daripada kerugian bersih mesin (−14R). */
export const MONDAY_LOW = {
  naked: { n: 28, win: 0, totalR: -28 },
  familyN: 38,
  familyR: -32,
} as const;

/** Win 2R dan kalah −1R impas di 1/3. Di bawah itu ekspektasinya negatif, sebelum biaya. */
export const BREAKEVEN_WIN = 1 / 3;
