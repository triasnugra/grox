import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyze } from "./analyze.ts";
import { gradeTrade } from "./grade.ts";
import { judge, symbolIssue, type JudgeCtx } from "./gates.ts";
import { scanInput } from "./math.ts";
import type { Analysis, Candle } from "./types.ts";

const ctx = (over: Partial<JudgeCtx> = {}): JudgeCtx => ({
  btcTrend: -1,
  active: new Set(),
  calendar: [],
  ...over,
});

function setup(over: Partial<Analysis> = {}): Analysis {
  return {
    symbol: "ETH",
    analyzedAt: Date.UTC(2026, 9, 29, 1, 0),
    px: 100,
    tr: -1,
    td: -1,
    tw: -1,
    weeks: 80,
    flip: false,
    e20: 110,
    e50: 120,
    rsi: 42,
    obvDiv: 0,
    rsiDiv: 0,
    ret30: -0.08,
    tags: [],
    chart: [],
    chartOff: 0,
    H: 130,
    L: 90,
    zoneLong: { a: 90, b: 94 },
    zoneShort: { a: 126, b: 130 },
    wlow: 80,
    whigh: 140,
    monL: 99,
    monH: 104,
    pos: 0.2,
    mid: false,
    flat: false,
    qv: 5e7,
    closed: 200,
    devUp: false,
    devDn: false,
    ddUp: false,
    ddDn: false,
    mDevUp: false,
    mDevDn: false,
    wUp: false,
    wDn: false,
    boUp: false,
    boDn: false,
    zUp: false,
    zDn: false,
    legacySide: -1,
    legacyWhy: ["Fib 0.75 tren turun", "searah tren"],
    legacyTrig: "fib",
    legacyAge: 0,
    fresh: { id: "fib", index: 199, age: 0, label: "Fib 0.75 tren turun" },
    staleIgnored: [],
    entry: 100,
    sl: 105,
    tp: 90,
    t2: 90,
    slp: 5,
    dist: 0.4,
    planType: "swing",
    tl: null,
    activeWhy: ["Fib 0.75 tren turun", "searah tren"],
    activeTrig: "fib",
    activeAge: 0,
    tpAlreadyHit: false,
    entryAfterTp: false,
    ...over,
  };
}

describe("gerbang kualitas", () => {
  it("menolak simbol kosong dan stablecoin sebelum tercatat", () => {
    assert.equal(symbolIssue("")?.code, "SYMBOL_KOSONG");
    assert.equal(symbolIssue("  ")?.code, "SYMBOL_KOSONG");
    assert.equal(symbolIssue("USDC")?.code, "SYMBOL_TIDAK_VALID");
    assert.equal(symbolIssue("BTC"), null);
  });

  it("menolak waktu analisis yang tidak diketahui", () => {
    const d = judge(setup({ analyzedAt: 0, symbol: "BTC" }), ctx());
    assert.equal(d.verdict, "dieliminasi");
    assert.ok(d.issues.some((i) => i.code === "WAKTU_TIDAK_DIKETAHUI"));
  });

  it("meloloskan short segar yang searah dan punya dua alasan", () => {
    const d = judge(setup(), ctx());
    assert.equal(d.verdict, "eksekusi");
    assert.equal(d.confluence, 2);
  });

  it("mengeliminasi seluruh long Monday Low, termasuk yang punya konfluensi", () => {
    const d = judge(
      setup({
        symbol: "SOL",
        tr: 1,
        td: 1,
        tw: 1,
        legacySide: 1,
        activeTrig: "mon",
        fresh: { id: "mon", index: 199, age: 0, label: "sweep Monday Low lalu reclaim" },
        activeWhy: ["sweep Monday Low lalu reclaim", "OBV divergence", "searah tren"],
        entry: 100,
        sl: 95,
        tp: 110,
        mDevUp: true,
      }),
      ctx({ btcTrend: 1 }),
    );
    assert.equal(d.verdict, "dieliminasi");
    assert.ok(d.issues.some((i) => i.code === "MONDAY_LOW_LONG"));
  });

  it("mengeliminasi setup yang TP-nya sudah kena sebelum entry", () => {
    const d = judge(setup({ tpAlreadyHit: true }), ctx());
    assert.equal(d.verdict, "dieliminasi");
    assert.ok(d.issues.some((i) => i.code === "TP_SUDAH_TERSENTUH"));
  });

  it("mengeliminasi pemicu yang lebih tua dari candle terakhir", () => {
    const d = judge(setup({ fresh: null, activeAge: 3, legacyAge: 3 }), ctx());
    assert.equal(d.verdict, "dieliminasi");
    assert.ok(d.issues.some((i) => i.code === "PEMICU_BASI"));
  });

  it("menolak long lawan tren dan long altcoin saat BTC turun", () => {
    const long = setup({
      symbol: "SOL",
      tr: -1,
      legacySide: 1,
      activeTrig: "dev",
      fresh: { id: "dev", index: 199, age: 0, label: "deviasi bawah lalu recovery" },
      activeWhy: ["deviasi bawah lalu recovery", "RSI divergence"],
      entry: 100,
      sl: 95,
      tp: 110,
      devUp: true,
    });
    const trend = judge(long, ctx({ btcTrend: 1 }));
    assert.ok(trend.issues.some((i) => i.code === "MELAWAN_TREN"));
    const btc = judge(setup({ ...long, tr: 1 }), ctx({ btcTrend: -1 }));
    assert.ok(btc.issues.some((i) => i.code === "LONG_SAAT_BTC_TURUN"));
  });

  it("tidak menerbitkan ulang koin yang masih punya order aktif", () => {
    const d = judge(setup(), ctx({ active: new Set(["ETH"]) }));
    assert.ok(d.issues.some((i) => i.code === "ORDER_MASIH_AKTIF"));
    assert.equal(d.verdict, "dieliminasi");
  });

  it("menurunkan alasan tunggal menjadi pantauan, bukan ukuran posisi", () => {
    const d = judge(setup({ activeWhy: ["deviasi atas gagal bertahan"] }), ctx());
    assert.equal(d.verdict, "pantauan");
    assert.ok(d.issues.some((i) => i.code === "KONFLUENSI_KURANG"));
  });

  it("menunda eksekusi pada hari kalender yang dilarang", () => {
    const d = judge(setup(), ctx({ calendar: ["Senin UTC."] }));
    assert.equal(d.verdict, "pantauan");
    assert.ok(d.issues.some((i) => i.code === "KALENDER"));
  });

  it("setup tanpa sisi tidak masuk jurnal", () => {
    const d = judge(setup({ legacySide: 0, fresh: null, activeWhy: [] }), ctx());
    assert.equal(d.verdict, "tidak_ada");
  });
});

describe("analisis pada deret sintetis", () => {
  it("tidak melempar pada 200 hari dan mengisi harga", () => {
    const t0 = Date.UTC(2025, 0, 6);
    let p = 100;
    const k: Candle[] = [];
    for (let i = 0; i < 220; i++) {
      const o = p;
      p = p * (1 - 0.0015);
      k.push({
        t: t0 + i * 864e5,
        o,
        h: Math.max(o, p) + 0.25,
        l: Math.min(o, p) - 0.25,
        c: p,
        v: 2_000_000,
      });
    }
    const now = k.at(-1)!.t + 3_600_000;
    const sc = scanInput(k, now);
    const a = analyze(sc.bars, sc.qv, sc.analyzedAt, "BTC");
    assert.equal(Number.isFinite(a.px), true);
    assert.ok(a.closed >= 120);
  });
});

describe("penilaian trade tetap konservatif", () => {
  const H = 36e5;
  const bar = (i: number, o: number, h: number, l: number, c: number) => ({
    ot: i * H,
    o,
    h,
    l,
    c,
    ct: i * H + H - 1,
  });

  it("SL pada candle pengisi tetap dihitung SL", async () => {
    const g = await gradeTrade(
      { arah: "LONG", entry: 100, sl: 95, tp: 110, t: 0, due: 6 * H },
      { h1: async () => [bar(0, 101, 102, 94, 96), bar(1, 96, 97, 95, 96)], now: 1e15 },
    );
    assert.equal(g?.hasil, "SL");
    assert.equal(g?.R, -1);
  });

  it("belum jatuh tempo mengembalikan null, bukan EXPIRED palsu", async () => {
    const g = await gradeTrade(
      { arah: "LONG", entry: 100, sl: 95, tp: 110, t: 0, due: 6 * H },
      { h1: async () => [bar(0, 100, 102, 99.5, 101)], now: 2 * H },
    );
    assert.equal(g, null);
  });
});
