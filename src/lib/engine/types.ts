export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Side = -1 | 0 | 1;

export type GateCode =
  | "SYMBOL_KOSONG"
  | "SYMBOL_TIDAK_VALID"
  | "WAKTU_TIDAK_DIKETAHUI"
  | "HARGA_TIDAK_VALID"
  | "SL_SALAH_SISI"
  | "TP_SALAH_SISI"
  | "RISIKO_NOL"
  | "SL_TERLALU_LEBAR"
  | "SL_LEBAR_SPOT"
  | "MONDAY_LOW_LONG"
  | "TP_SUDAH_TERSENTUH"
  | "PEMICU_BASI"
  | "MID_RANGE"
  | "MELAWAN_TREN"
  | "LONG_SAAT_BTC_TURUN"
  | "ORDER_MASIH_AKTIF"
  | "KONFLUENSI_KURANG"
  | "KALENDER";

export type Verdict = "eksekusi" | "pantauan" | "dieliminasi" | "tidak_ada";

export type Issue = {
  code: GateCode;
  level: "hard" | "soft";
  text: string;
};

export type TrendLine = { a: number; av: number; sl: number; e: number };

export type Zone = { a: number; b: number };

/** Trigger yang boleh membuka rencana. Urutan = prioritas mesin lama. */
export type TrigId = "dd" | "dev" | "mon" | "zone" | "bo" | "wolf" | "fib";

export type Candidate = {
  id: TrigId;
  index: number;
  age: number;
  label: string;
};

export type Analysis = {
  symbol: string;
  analyzedAt: number;
  px: number;
  tr: Side;
  td: Side;
  tw: Side;
  weeks: number;
  flip: boolean;
  e20: number;
  e50: number;
  rsi: number | null;
  obvDiv: Side;
  rsiDiv: Side;
  ret30: number;
  tags: string[];
  /** Bar scan (tutup + open hari ini), 90 terakhir, untuk grafik. */
  chart: Candle[];
  chartOff: number;
  H: number;
  L: number;
  zoneLong: Zone;
  zoneShort: Zone;
  wlow: number;
  whigh: number;
  monL: number | null;
  monH: number | null;
  pos: number;
  mid: boolean;
  flat: boolean;
  qv: number;
  closed: number;
  devUp: boolean;
  devDn: boolean;
  ddUp: boolean;
  ddDn: boolean;
  mDevUp: boolean;
  mDevDn: boolean;
  wUp: boolean;
  wDn: boolean;
  boUp: boolean;
  boDn: boolean;
  zUp: boolean;
  zDn: boolean;
  /** Sisi yang akan dicatat mesin lama, berikut rencananya. */
  legacySide: Side;
  legacyWhy: string[];
  legacyTrig: TrigId | null;
  legacyAge: number;
  /** Pemicu segar (umur 0). Null bila semua pemicu sudah basi. */
  fresh: Candidate | null;
  staleIgnored: Candidate[];
  entry: number | null;
  sl: number | null;
  tp: number | null;
  t2: number | null;
  slp: number | null;
  dist: number | null;
  planType: string | null;
  tl: TrendLine | null;
  /** Rencana yang dinilai gerbang: pemicu segar bila ada, jika tidak rencana lama. */
  activeWhy: string[];
  activeTrig: TrigId | null;
  activeAge: number;
  tpAlreadyHit: boolean;
  entryAfterTp: boolean;
};

export type Decision = {
  verdict: Verdict;
  issues: Issue[];
  confluence: number;
  parts: string[];
};

export type JournalStatus = "menunggu" | "TP" | "SL" | "kedaluwarsa" | "tidak terisi" | "tidak valid";

export type JournalRow = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp: number;
  alasan: string;
  t: number;
  due: number;
  hasil: JournalStatus;
  R: number | null;
};
