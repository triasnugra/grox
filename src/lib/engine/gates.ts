import type { Analysis, Decision, GateCode, Issue, Side } from "./types.ts";

const STABLES = new Set(
  "USDC,FDUSD,TUSD,USDP,DAI,BUSD,EUR,AEUR,USD1,XUSD,PAXG,USDE,PYUSD,U,USDS,USDD,RLUSD,BFUSD,USDG".split(","),
);

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/USDT$/, "");
}

export function symbolIssue(symbol: string): Issue | null {
  const s = normalizeSymbol(symbol);
  if (!s) return hard("SYMBOL_KOSONG", "Simbol kosong. Dieliminasi sebelum dicatat, bukan sesudah.");
  if (!/^[A-Z0-9]{2,20}$/.test(s) || STABLES.has(s)) {
    return hard("SYMBOL_TIDAK_VALID", `${s || "simbol"} bukan pasangan yang bisa dinilai.`);
  }
  return null;
}

function hard(code: GateCode, text: string): Issue {
  return { code, level: "hard", text };
}
function soft(code: GateCode, text: string): Issue {
  return { code, level: "soft", text };
}

function realConfluence(a: Analysis, side: Side): { n: number; parts: string[] } {
  const banned = side === 1 ? "sweep Monday Low lalu reclaim" : "";
  const parts = a.activeWhy.filter((w) => w !== banned && !w.includes("diabaikan"));
  return { n: parts.length, parts };
}

function againstTrend(a: Analysis, side: Side): boolean {
  if (side === 1) return a.tr !== 1;
  if (a.tr === -1) return false;
  const deviation = a.devDn || a.ddDn || a.mDevDn || a.wDn;
  if (a.tr === 1 && !deviation) return true;
  return false;
}

function midBlocked(a: Analysis, side: Side): boolean {
  if (!a.mid) return false;
  if (side === 1) return !(a.devUp || a.ddUp);
  return !(a.devDn || a.ddDn || a.mDevDn);
}

export type JudgeCtx = {
  btcTrend: Side;
  active: Set<string>;
  calendar: string[];
};

/**
 * Gerbang terbit. Hanya `eksekusi` yang boleh masuk jurnal.
 * `dieliminasi` = mesin lama akan mencatat, mesin ini menolak.
 * `pantauan` = sah dilihat, tidak diukur sebagai trade.
 */
export function judge(a: Analysis, ctx: JudgeCtx): Decision {
  const issues: Issue[] = [];
  const sym = symbolIssue(a.symbol);
  if (sym) issues.push(sym);
  if (!Number.isFinite(a.analyzedAt) || a.analyzedAt <= 0) {
    issues.push(hard("WAKTU_TIDAK_DIKETAHUI", "Waktu analisis tidak ada. Setup dari sebelum pelacakan tidak dinilai dan tidak diterbitkan."));
  }
  const side = a.legacySide;
  if (!side) return { verdict: "tidak_ada", issues, confluence: 0, parts: [] };

  const nums = [a.entry, a.sl, a.tp, a.px];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
    issues.push(hard("HARGA_TIDAK_VALID", "Entry, SL, atau TP bukan angka. Dieliminasi."));
  } else {
    const entry = a.entry!;
    const sl = a.sl!;
    const tp = a.tp!;
    if (!(side * (entry - sl) > 0)) issues.push(hard("SL_SALAH_SISI", "SL tidak berada di sisi yang melindungi posisi."));
    if (!(side * (tp - entry) > 0)) issues.push(hard("TP_SALAH_SISI", "TP tidak berada di sisi target."));
    if (!(Math.abs(entry - sl) > 0)) issues.push(hard("RISIKO_NOL", "Jarak entry ke SL nol."));
    if ((a.slp ?? 100) > 15) {
      if (a.planType === "spot (SL lebar)") {
        issues.push(soft("SL_LEBAR_SPOT", "SL lebih dari 15%. Hanya pantauan spot tanpa leverage, tidak dieksekusi."));
      } else {
        issues.push(hard("SL_TERLALU_LEBAR", `SL ${a.slp?.toFixed(1)}% melewati batas 15%.`));
      }
    }
  }

  const mondayActive =
    side === 1 &&
    (a.activeTrig === "mon" || a.activeWhy.some((w) => w.startsWith("sweep Monday Low")));
  if (mondayActive) {
    issues.push(
      hard(
        "MONDAY_LOW_LONG",
        "Sweep Monday Low lalu reclaim tidak lagi menjadi sinyal. Keluarga pola ini −32R pada 18–28 Okt 2026, termasuk 28 trade tanpa konfluensi yang semuanya kalah.",
      ),
    );
  }

  if (a.tpAlreadyHit || a.entryAfterTp) {
    issues.push(
      hard(
        "TP_SUDAH_TERSENTUH",
        "TP sudah tersentuh pada candle sebelum tanggal entry. Setup semacam ini yang mengisi kategori EXPIRED: harga lebih dulu selesai, sinyalnya menyusul.",
      ),
    );
  }

  if (!a.fresh || a.activeAge > 0) {
    issues.push(
      hard(
        "PEMICU_BASI",
        `Pemicu berumur ${a.activeAge} hari tutup. Mesin lama mengulang pola yang sama sepanjang minggu; yang sudah lewat tidak diterbitkan lagi.`,
      ),
    );
  }

  if (midBlocked(a, side)) {
    issues.push(hard("MID_RANGE", "Harga di tengah range. Monday Low tidak lagi menjadi alasan untuk mengabaikan aturan ini."));
  }

  if (againstTrend(a, side)) {
    issues.push(
      hard(
        "MELAWAN_TREN",
        side === 1
          ? "Long hanya saat tren makro naik. Pengecualian lawan-tren, termasuk Monday Low, dicabut."
          : "Short melawan tren naik tanpa deviasi ditolak.",
      ),
    );
  }

  if (side === 1 && normalizeSymbol(a.symbol) !== "BTC" && ctx.btcTrend === -1) {
    issues.push(hard("LONG_SAAT_BTC_TURUN", "Long altcoin saat tren makro BTC turun diblokir. BTC tetap gerbang."));
  }

  if (ctx.active.has(normalizeSymbol(a.symbol))) {
    issues.push(
      hard(
        "ORDER_MASIH_AKTIF",
        "Masih ada order aktif pada koin ini. Satu order per koin, supaya scan besok tidak mencatat ulang setup yang sama.",
      ),
    );
  }

  const conf = realConfluence(a, side);
  if (conf.n < 2) {
    issues.push(
      soft(
        "KONFLUENSI_KURANG",
        conf.n === 0
          ? "Tidak ada alasan independen yang masih berlaku."
          : `Hanya satu alasan (${conf.parts[0]}). Eksekusi butuh minimal dua. Ini pantauan, bukan ukuran posisi.`,
      ),
    );
  }

  if (ctx.calendar.length && !issues.some((i) => i.level === "hard")) {
    issues.push(soft("KALENDER", ctx.calendar.join(" ")));
  }

  const hardHit = issues.some((i) => i.level === "hard");
  const verdict = hardHit ? "dieliminasi" : issues.length ? "pantauan" : "eksekusi";
  return { verdict, issues, confluence: conf.n, parts: conf.parts };
}
