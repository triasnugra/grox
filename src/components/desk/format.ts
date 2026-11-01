import type { Side } from "@/lib/engine/types";

const TREND = ["turun", "netral", "naik"] as const;

export function trendWord(side: Side, weeks = 80, weekly = false): string {
  if (weekly && weeks < 55) return "n/a";
  return TREND[side + 1] ?? "netral";
}

export function px(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(3);
  return v.toPrecision(3);
}

export function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function rFmt(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}R`;
}

export function qty(v: number): string {
  if (!Number.isFinite(v)) return "–";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toPrecision(3);
}

/**
 * Harga untuk jurnal dan kartu yang dibaca mesin lain (monitor): 7 angka signifikan, tanpa notasi
 * ilmiah dan tanpa pemisah ribuan. `px` membulatkan ke 3 angka signifikan untuk harga < 1, terlalu kasar
 * untuk mencocokkan level entry dan menilai ulang dengan candle.
 */
export function pxFull(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = String(Number(v.toPrecision(7)));
  if (!/e/i.test(s)) return s;
  return v.toFixed(14).replace(/0+$/, "").replace(/\.$/, "");
}

/** Waktu dengan zona eksplisit, 'YYYY-MM-DD HH:MM UTC'. Monitor menolak waktu tanpa zona. */
export function fmtUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
