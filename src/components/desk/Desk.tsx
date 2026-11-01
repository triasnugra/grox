import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, BookOpen, Eye, RefreshCw, ScanSearch, Shield } from "lucide-react";
import { analyze } from "@/lib/engine/analyze";
import { calendarHolds, infoAlerts } from "@/lib/engine/calendar";
import { BREAKEVEN_WIN, DIRECTION, EVIDENCE_ASOF, MACHINE, MONDAY_LOW } from "@/lib/engine/evidence";
import { gradeTrade, isActive, mapK } from "@/lib/engine/grade";
import { judge } from "@/lib/engine/gates";
import { binance, klines, topUsdt } from "@/lib/engine/market";
import { scanInput } from "@/lib/engine/math";
import type { Analysis, Decision, JournalRow, Side, Verdict } from "@/lib/engine/types";
import { Chart } from "./Chart";
import { fmtUtc, pct, px, pxFull, qty, rFmt, trendWord } from "./format";

const JOURNAL_KEY = "asgra-m2-journal";
const RISK_KEY = "asgra-m2-risk";
const DAY = 864e5;

type Tab = "eksekusi" | "pantauan" | "dieliminasi" | "koin" | "jurnal" | "bukti";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "eksekusi", label: "Eksekusi" },
  { id: "pantauan", label: "Pantauan" },
  { id: "dieliminasi", label: "Ditolak" },
  { id: "koin", label: "40 koin" },
  { id: "jurnal", label: "Jurnal" },
  { id: "bukti", label: "Bukti" },
];

const GATES = [
  ["Pemicu harus segar", "Hanya candle harian yang baru tutup. Pola yang masih menyala beberapa hari kemudian tidak dicatat ulang."],
  ["TP yang sudah kena", "Kalau harga menyentuh TP sebelum tanggal entry, setup dibuang. Itu isi kategori EXPIRED di monitor."],
  ["Monday Low bukan long", "28 trade tanpa konfluensi, tidak ada yang menang, −28R. Seluruh keluarga polanya −32R."],
  ["Long searah tren", "Long lawan tren dicabut. Long altcoin juga ditutup saat tren makro BTC turun."],
  ["Minimal dua alasan", "Satu pola tetap kelihatan, tetapi tidak mendapat ukuran posisi."],
  ["Valid sebelum tercatat", "Simbol kosong, waktu tidak diketahui, SL salah sisi, dan SL di atas 15% tidak masuk jurnal."],
  ["Satu order per koin", "Scan berikutnya tidak menerbitkan ulang koin yang ordernya masih hidup."],
  ["Kalender diam", "Senin UTC, hari terakhir bulan, libur volume tipis, dan FOMC: tidak ada order baru."],
] as const;

function loadJournal(): JournalRow[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalRow[]) : [];
  } catch {
    return [];
  }
}

function idle(a: Analysis): string {
  if (a.flat) return "harga datar";
  if (a.mid) return "tengah range";
  if (a.pos < 0.2) return "dekat dasar";
  if (a.pos > 0.8) return "dekat puncak";
  return "belum ada pemicu";
}

function rowId(a: Analysis): string {
  const day = new Date(a.analyzedAt).toISOString().slice(0, 10);
  const side = a.legacySide === 1 ? "LONG" : "SHORT";
  return `${day}|${a.symbol}|${side}`;
}

function toJournalRow(a: Analysis, d: Decision): JournalRow | null {
  if (d.verdict !== "eksekusi" || a.entry == null || a.sl == null || a.tp == null) return null;
  return {
    id: rowId(a),
    symbol: a.symbol,
    side: a.legacySide === 1 ? "LONG" : "SHORT",
    entry: a.entry,
    sl: a.sl,
    tp: a.tp,
    alasan: d.parts.join(", "),
    t: a.analyzedAt,
    due: a.analyzedAt + 7 * DAY,
    hasil: "menunggu",
    R: null,
  };
}

function verdictWord(v: Verdict): string {
  if (v === "eksekusi") return "Siap";
  if (v === "pantauan") return "Pantauan";
  if (v === "dieliminasi") return "Ditolak";
  return "Diam";
}

export function Desk() {
  const [tab, setTab] = useState<Tab>("bukti");
  const [cap, setCap] = useState("1000");
  const [risk, setRisk] = useState("1");
  const [symbol, setSymbol] = useState("BTC");
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [btcTrend, setBtcTrend] = useState<Side>(0);
  const [holds, setHolds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState("Belum ada scan pada sesi ini.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ scanned: number; skipped: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [grading, setGrading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const j = loadJournal();
    setJournal(j);
    try {
      const r = JSON.parse(localStorage.getItem(RISK_KEY) || "{}") as { cap?: string; risk?: string };
      if (r.cap) setCap(r.cap);
      if (r.risk) setRisk(r.risk);
    } catch {
      /* biarkan default */
    }
    setHolds(calendarHolds());
    setNotes(infoAlerts());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  }, [journal, ready]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(RISK_KEY, JSON.stringify({ cap, risk }));
  }, [cap, risk, ready]);

  // Detak 1 detik selama scan: DOM terus berubah, sehingga pembaca luar (monitor) menunggu sampai scan benar-benar selesai.
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [busy]);

  const scanIds = useMemo(() => new Set(analyses.map(rowId)), [analyses]);
  const active = useMemo(() => {
    const set = new Set<string>();
    for (const r of journal) {
      if (!isActive(r) || scanIds.has(r.id)) continue;
      set.add(r.symbol);
    }
    return set;
  }, [journal, scanIds]);
  const judged = useMemo(
    () => analyses.map((a) => ({ a, d: judge(a, { btcTrend, active, calendar: holds }) })),
    [analyses, btcTrend, active, holds],
  );
  const exec = judged.filter((x) => x.d.verdict === "eksekusi").sort((p, q) => q.d.confluence - p.d.confluence || (p.a.dist ?? 99) - (q.a.dist ?? 99));
  const watch = judged.filter((x) => x.d.verdict === "pantauan");
  const dead = judged.filter((x) => x.d.verdict === "dieliminasi");
  const btc = analyses.find((a) => a.symbol === "BTC") ?? null;
  const capital = Number(cap) || 0;
  const riskPct = Number(risk) || 0;

  async function run(list?: string[]) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress(0.04);
    setHolds(calendarHolds());
    setNotes(infoAlerts());
    try {
      const symbols = list?.length ? list.map((s) => s.toUpperCase()) : await topUsdt(40, ac.signal);
      if (!symbols.includes("BTC") && !list) symbols.unshift("BTC");
      const out: Analysis[] = [];
      const step = 6;
      for (let i = 0; i < symbols.length; i += step) {
        if (ac.signal.aborted) return;
        const slice = symbols.slice(i, i + step);
        setStatus(`Memindai ${Math.min(i + slice.length, symbols.length)} dari ${symbols.length}`);
        const part = (
          await Promise.all(
            slice.map(async (s) => {
              try {
                const raw = await klines(`${s}USDT`, ac.signal);
                const sc = scanInput(raw);
                return analyze(sc.bars, sc.qv, sc.analyzedAt, s);
              } catch (err) {
                if (ac.signal.aborted) throw err;
                return null;
              }
            }),
          )
        ).filter((row): row is Analysis => row !== null);
        out.push(...part);
        const b = out.find((a) => a.symbol === "BTC");
        if (b) setBtcTrend(b.tr);
        setAnalyses([...out]);
        setProgress((Math.min(i + slice.length, symbols.length) / symbols.length));
      }
      const skipped = symbols.length - out.length;
      if (out.length) setDone({ scanned: out.length, skipped });
      else setStatus("Tidak ada koin yang bisa dinilai.");
      if (!out.length) setError("Data harian tidak cukup, atau Binance tidak mengembalikan kline.");
      setTab(out.length ? "eksekusi" : "bukti");
      setOpen(null);
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "gagal";
      setError(msg.includes("Failed to fetch") || msg.includes("Network") ? "Binance tidak terjangkau dari jaringan ini. Coba lagi." : msg);
      setStatus("Scan berhenti.");
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }

  const execKey = exec.map(({ a }) => rowId(a)).join("\n");

  useEffect(() => {
    if (!ready || !execKey) return;
    const rows = exec.flatMap(({ a, d }) => {
      const row = toJournalRow(a, d);
      return row ? [row] : [];
    });
    if (!rows.length) return;
    setJournal((prev) => {
      const known = new Set(prev.map((r) => r.id));
      const add = rows.filter((r) => !known.has(r.id));
      return add.length ? [...add, ...prev] : prev;
    });
  }, [ready, execKey]);

  async function gradeAll() {
    setGrading(true);
    try {
      const next = await Promise.all(
        journal.map(async (row) => {
          if (row.hasil !== "menunggu") return row;
          try {
            const start = Math.floor(row.t / 36e5) * 36e5;
            const h1 = async () => {
              const rows = (await binance(`klines?symbol=${row.symbol}USDT&interval=1h&startTime=${start}&limit=200`)) as unknown[][];
              return rows.map((r) => mapK(r as number[]));
            };
            const m1 = async (from: number, to: number) => {
              const rows = (await binance(
                `klines?symbol=${row.symbol}USDT&interval=1m&startTime=${from}&endTime=${to}&limit=1000`,
              )) as unknown[][];
              return rows.map((r) => mapK(r as number[]));
            };
            const g = await gradeTrade(
              { arah: row.side, entry: row.entry, sl: row.sl, tp: row.tp, t: row.t, due: row.due },
              { h1, m1 },
            );
            if (!g) return row;
            return { ...row, hasil: g.hasil, R: +g.R.toFixed(2) };
          } catch {
            return row;
          }
        }),
      );
      setJournal(next);
    } finally {
      setGrading(false);
    }
  }

  const shown =
    tab === "eksekusi" ? exec : tab === "pantauan" ? watch : tab === "dieliminasi" ? dead : [];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-brass">ASGRA</p>
          <h1 className="text-2xl font-semibold leading-tight">Mesin 2</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Gerbang kualitas di depan jurnal. Setup yang sudah selesai, simbol yang tidak valid, dan long Monday Low tidak diterbitkan.
          </p>
        </div>
        <button
          id="go"
          type="button"
          title="Pindai 40 koin USDT paling likuid"
          onClick={() => run()}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brass px-4 text-sm font-semibold text-bg disabled:opacity-50"
        >
          {busy ? <RefreshCw className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
          {busy ? "Memindai" : "Scan ulang"}
        </button>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Win rate lama" value={pct(MACHINE.win)} hint={`n=${MACHINE.n} · ${EVIDENCE_ASOF}`} />
        <Tile label="Ekspektasi" value={rFmt(MACHINE.expR)} hint="per trade terisi" tone="down" />
        <Tile label="Total" value={`${MACHINE.totalR}R`} hint={`drawdown ${MACHINE.maxDd}R`} tone="down" />
        <Tile label="EXPIRED" value={String(MACHINE.expired)} hint={`dari ${MACHINE.setups} setup`} />
      </section>

      <p className="mt-3 text-sm text-muted">
        Target 2R butuh menang di atas {pct(BREAKEVEN_WIN)} hanya untuk impas, sebelum biaya. {pct(MACHINE.win)} tidak cukup untuk uang nyata.
        Angka ini bukti 18–28 Oktober, bukan janji hasil yang akan datang.
      </p>

      {holds.length > 0 && (
        <div className="mt-3 rounded-lg border border-brass/40 bg-brass/10 px-3 py-2 text-sm">
          {holds.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}
      {notes.length > 0 && <p className="mt-2 text-sm text-muted">{notes.join(" ")}</p>}
      {error && <p className="mt-3 rounded-lg border border-down/50 bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}

      <div className="mt-4 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full bg-brass transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <p id="st" className="mt-2 text-sm text-muted">
        {busy
          ? `${status} · ${elapsed} dtk`
          : done
            ? `Selesai: ${exec.length} koin punya setup · ${done.scanned} koin dipindai${done.skipped ? `, ${done.skipped} dilewati (riwayat kurang dari 120 hari)` : ""}.`
            : status}
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const s = symbol.trim().toUpperCase().replace(/USDT$/, "");
          if (!s) {
            setError("Simbol kosong. Tidak ada yang dicatat.");
            return;
          }
          setError(null);
          run([s, ...(s === "BTC" ? [] : ["BTC"])]);
        }}
      >
        <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-muted">
          Cek satu simbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 font-mono text-base text-fg"
            placeholder="ETH"
            autoCapitalize="characters"
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-muted">
          Modal ($)
          <input value={cap} inputMode="decimal" onChange={(e) => setCap(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3 font-mono text-base text-fg" />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-muted">
          Risiko (%)
          <input value={risk} inputMode="decimal" onChange={(e) => setRisk(e.target.value)} className="min-h-11 rounded-lg border border-line bg-surface px-3 font-mono text-base text-fg" />
        </label>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium disabled:opacity-50">
          Cek
        </button>
      </form>

      {btc && (
        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-brass" />
            <h2 className="text-base font-semibold">Gerbang BTC</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field k="Harga" v={px(btc.px)} />
            <Field k="Tren weekly" v={trendWord(btc.tw, btc.weeks, true)} />
            <Field k="Tren daily" v={trendWord(btc.td)} />
            <Field k="Posisi range" v={`${Math.round(btc.pos * 100)}%`} />
          </div>
          <p className="mt-3 text-sm text-muted">{btcBias(btc)}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            Support weekly {px(btc.wlow)} · resistance {px(btc.whigh)}
            {btc.flip ? " · tren weekly baru berbalik" : ""}
          </p>
        </section>
      )}

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => {
          const n = t.id === "eksekusi" ? exec.length : t.id === "pantauan" ? watch.length : t.id === "dieliminasi" ? dead.length : t.id === "jurnal" ? journal.length : null;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`min-h-11 shrink-0 rounded-full border px-3 text-sm ${on ? "border-brass bg-brass/15 text-fg" : "border-line text-muted"}`}
            >
              {t.label}
              {n != null && analyses.length + journal.length > 0 ? ` ${n}` : ""}
            </button>
          );
        })}
      </div>

      {tab === "bukti" && <Evidence />}


      {tab === "koin" && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                {["Koin", "Weekly", "Daily", "Range", "Pola", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...judged]
                .sort((p, q) => Math.min(p.a.pos, 1 - p.a.pos) - Math.min(q.a.pos, 1 - q.a.pos))
                .map(({ a, d }) => (
                  <tr key={a.symbol} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <button type="button" className="min-h-11 text-left" onClick={() => { setOpen(a.symbol); setTab(d.verdict === "tidak_ada" ? "koin" : d.verdict); }}>
                        {a.symbol}
                      </button>
                    </td>
                    <td className="px-3 py-2">{trendWord(a.tw, a.weeks, true)}</td>
                    <td className="px-3 py-2">{trendWord(a.td)}</td>
                    <td className="px-3 py-2 font-mono">{Math.round(a.pos * 100)}%</td>
                    <td className="px-3 py-2 text-muted">{a.tags.join(", ") || "–"}</td>
                    <td className="px-3 py-2">{d.verdict === "tidak_ada" ? idle(a) : verdictWord(d.verdict)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {analyses.length === 0 && <p className="px-3 py-6 text-sm text-muted">Scan dulu. Tabel ini mengisi setelah harga harian masuk.</p>}
          {open && tab === "koin" && analyses.some((a) => a.symbol === open) && (
            <div className="border-t border-line p-3">
              <Chart a={analyses.find((a) => a.symbol === open)!} />
            </div>
          )}
        </div>
      )}

      {(tab === "eksekusi" || tab === "pantauan" || tab === "dieliminasi") && (
        <section id="out" className="mt-3 space-y-3">
          {analyses.length > 0 && tab === "eksekusi" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">
                {exec.length === 0
                  ? "Tidak ada yang lolos gerbang. Diam juga posisi."
                  : `${exec.length} setup boleh diukur dan langsung masuk Jurnal. ${dead.length} ditolak sebelum jurnal, ${watch.length} hanya dipantau.`}
              </p>
              {exec.length > 0 && (
                <p className="text-sm text-brass">Tersimpan otomatis di Jurnal</p>
              )}
            </div>
          )}
          {tab === "eksekusi" && exec.length >= 3 && new Set(exec.map((x) => x.a.activeTrig)).size === 1 && (
            <p className="text-sm text-brass">Satu peristiwa pasar, bukan {exec.length} ide yang terpisah. Jangan menjumlahkan risikonya.</p>
          )}
          {tab === "dieliminasi" && dead.length > 0 && <Hist items={dead.map((x) => x.d)} />}
          {shown.map(({ a, d }) => (
            <Card
              key={a.symbol + d.verdict}
              a={a}
              d={d}
              capital={capital}
              riskPct={riskPct}
              open={open === a.symbol}
              onToggle={() => setOpen(open === a.symbol ? null : a.symbol)}
              recorded={journal.some((r) => r.id === rowId(a))}
            />
          ))}
          {analyses.length === 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-muted">
              Belum ada hasil. Scan membaca 40 koin USDT paling likuid, lalu tiap setup melewati gerbang sebelum boleh dicatat.
            </p>
          )}
          {analyses.length > 0 && shown.length === 0 && tab !== "eksekusi" && (
            <p className="text-sm text-muted">Kosong pada kategori ini.</p>
          )}
        </section>
      )}

      {/* Selalu ada di DOM (disembunyikan di luar tab Jurnal) supaya monitor bisa membaca tabelnya apa pun tab yang aktif. */}
      <div id="jr" hidden={tab !== "jurnal"}>
        <Journal rows={journal} busy={grading} onGrade={gradeAll} onClear={() => setJournal([])} />
      </div>
    </main>
  );
}

function btcBias(b: Analysis): string {
  if (b.mid) return "BTC di tengah range. Aktivitas dikurangi; tepi range yang dipakai, bukan tengahnya.";
  if (b.tr === 1) return b.pos < 0.4 ? "Tren naik dan dekat support. Long yang segar masih boleh dipertimbangkan." : "Tren naik. Long boleh, short hanya lewat deviasi yang segar.";
  if (b.tr === -1) return "Tren turun. Short yang lolos gerbang yang diutamakan. Long altcoin ditutup.";
  return "Tren makro netral. Ukuran diperkecil; tanpa deviasi yang segar tidak ada eksekusi short, dan tidak ada long.";
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "down" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl ${tone === "down" ? "text-down" : "text-fg"}`}>{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="font-mono text-sm">
      <span className="block font-sans text-xs text-muted">{k}</span>
      {v}
    </div>
  );
}

function Evidence() {
  return (
    <section className="mt-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {DIRECTION.map((d) => (
          <article key={d.side} className="rounded-xl border border-line bg-surface p-4">
            <h2 className={`font-mono text-sm ${d.side === "LONG" ? "text-down" : "text-up"}`}>{d.side}</h2>
            <p className="mt-1 font-mono text-lg">{d.n} trade · {pct(d.win)} · {rFmt(d.expR)}</p>
            <p className="text-sm text-muted">Total {d.totalR}R pada jendela yang sama.</p>
          </article>
        ))}
      </div>
      <article className="rounded-xl border border-down/40 bg-surface p-4">
        <h2 className="text-base font-semibold">Bocoran yang ditutup</h2>
        <p className="mt-1 text-sm">
          “Sweep Monday Low lalu reclaim” tanpa alasan lain: {MONDAY_LOW.naked.n} trade, menang {MONDAY_LOW.naked.win}, total {MONDAY_LOW.naked.totalR}R.
          Bersama variannya: {MONDAY_LOW.familyN} trade, {MONDAY_LOW.familyR}R. Kerugian bersih mesin hanya {MACHINE.totalR}R — pola ini lebih besar daripada seluruh hasilnya.
        </p>
        <p className="mt-2 text-sm text-muted">
          Short pada jendela yang sama {DIRECTION[1].totalR > 0 ? "positif" : "negatif"} ({rFmt(DIRECTION[1].expR)}, n={DIRECTION[1].n}). Long di luar Monday Low hanya segelintir dan tidak cukup untuk mengharamkan semua long. Yang dilarang adalah long dari pola itu, long lawan tren, dan sinyal yang datang setelah TP.
        </p>
      </article>
      <ol className="grid gap-2 sm:grid-cols-2">
        {GATES.map(([title, body], i) => (
          <li key={title} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-mono text-xs text-brass">{String(i + 1).padStart(2, "0")}</p>
            <h3 className="mt-1 text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        TP dan SL yang sudah terjadi tidak diubah cara menilainya. Yang berubah adalah apa yang boleh diterbitkan. Forward test lama terkunci pada mesin sebelum gerbang ini; jendela baru dimulai dari sinyal yang lolos di sini.
      </p>
    </section>
  );
}

function Hist({ items }: { items: Decision[] }) {
  const counts = new Map<string, number>();
  for (const d of items) {
    const code = d.issues.find((i) => i.level === "hard")?.code ?? "lain";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(([code, n]) => (
        <span key={code} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">
          {code} {n}
        </span>
      ))}
    </div>
  );
}

function Card({
  a,
  d,
  capital,
  riskPct,
  open,
  onToggle,
  recorded,
}: {
  a: Analysis;
  d: Decision;
  capital: number;
  riskPct: number;
  open: boolean;
  onToggle: () => void;
  recorded: boolean;
}) {
  const side = a.legacySide === 1 ? "LONG" : "SHORT";
  const hard = d.issues.filter((i) => i.level === "hard");
  const list = hard.length ? hard : d.issues;
  const rs = capital * riskPct / 100;
  const riskDist = a.entry != null && a.sl != null ? Math.abs(a.entry - a.sl) : 0;
  const q = riskDist > 0 ? rs / riskDist : 0;
  const notional = q * (a.entry ?? 0);
  const lev = capital > 0 ? notional / capital : 0;
  return (
    <article
      data-s={a.symbol}
      className={`c rounded-xl border bg-surface p-4 ${
        d.verdict === "eksekusi" ? "border-brass/70" : d.verdict === "dieliminasi" ? "reject border-down/40" : "reject-watch border-line"
      }`}
    >
      <div className="t flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{a.symbol}</h3>
          <p className="text-xs text-muted">
            {a.activeTrig ?? "–"} · umur pemicu {a.activeAge === 0 ? "hari ini" : `${a.activeAge} hari`} · {a.planType ?? "–"}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <span className={`bd ${side === "LONG" ? "L" : "S"} rounded-full px-2 py-1 font-mono text-xs ${side === "LONG" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{side}</span>
          <span className="ch rounded-full border border-line px-2 py-1 text-xs text-muted">{verdictWord(d.verdict)}</span>
        </div>
      </div>
      {a.entry != null && (
        <div className="g4 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field k="Entry limit" v={pxFull(a.entry)} />
          <Field k={`SL ${a.slp?.toFixed(1) ?? "–"}%`} v={pxFull(a.sl)} />
          <Field k="TP 2R" v={pxFull(a.tp)} />
          <Field k="Jarak" v={`${(a.dist ?? 0).toFixed(1)}%`} />
        </div>
      )}
      <p className="m mt-2 text-xs text-muted">
        Harga {pxFull(a.px)} · jarak ke entry {(a.dist ?? 0).toFixed(1)}% · {a.activeTrig ?? "–"} · {a.planType ?? "–"}
      </p>
      {d.parts.length > 0 && <p className="m mt-3 text-sm">{d.parts.join(" · ")}</p>}
      {a.staleIgnored.length > 0 && (
        <p className="mt-1 text-xs text-muted">Diabaikan karena basi: {a.staleIgnored.map((s) => s.label).join(" · ")}</p>
      )}
      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((i) => (
            <li key={i.code} className="flex gap-2 text-sm text-muted">
              {i.level === "hard" ? <Ban className="mt-0.5 size-4 shrink-0 text-down" /> : <Eye className="mt-0.5 size-4 shrink-0 text-brass" />}
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
      {d.verdict === "eksekusi" && riskDist > 0 && (
        <p className="sz mt-3 rounded-lg bg-bg px-3 py-2 font-mono text-xs">
          Risiko ${rs.toFixed(0)} · qty {qty(q)} {a.symbol} · notional ${notional.toFixed(0)}
          {lev > 1.05 ? ` · leverage ${lev.toFixed(1)}×, kecilkan ukuran` : ""}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onToggle} className="min-h-11 rounded-lg border border-line px-3 text-sm">
          {open ? "Tutup grafik" : "Grafik"}
        </button>
        {d.verdict === "eksekusi" && (
          <span className="inline-flex min-h-11 items-center rounded-lg bg-brass px-3 text-sm font-semibold text-bg">
            {recorded ? "Sudah di jurnal" : "Menyimpan ke jurnal"}
          </span>
        )}
      </div>
      {open && <Chart a={a} />}
    </article>
  );
}

function Journal({ rows, busy, onGrade, onClear }: { rows: JournalRow[]; busy: boolean; onGrade: () => void; onClear: () => void }) {
  const closed = rows.filter((r) => r.hasil === "TP" || r.hasil === "SL");
  const wins = closed.filter((r) => r.hasil === "TP").length;
  const sum = rows.reduce((s, r) => s + (r.R ?? 0), 0);
  return (
    <section className="mt-3">
      <h2 className="sr-only">Jurnal sinyal</h2>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          <BookOpen className="mr-1 inline size-4" />
          {rows.length === 0
            ? "Jurnal lokal masih kosong. Setup di tab Eksekusi tersimpan otomatis ke sini."
            : `${rows.length} baris · menang ${closed.length ? Math.round((wins / closed.length) * 100) : 0}% dari ${closed.length} yang sudah TP/SL · jumlah R ${sum.toFixed(1)}`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onGrade} disabled={busy || rows.length === 0} className="min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50">
            {busy ? "Menilai" : "Nilai ulang"}
          </button>
          <button type="button" onClick={onClear} disabled={rows.length === 0} className="min-h-11 rounded-lg border border-line px-3 text-sm text-muted disabled:opacity-50">
            Kosongkan
          </button>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table id="jt" className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              {["Waktu", "Aset", "Arah", "Entry", "SL", "TP", "Hasil", "R", "Alasan"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{fmtUtc(r.t)}</td>
                <td className="px-3 py-2">{r.symbol}</td>
                <td className={`px-3 py-2 ${r.side === "LONG" ? "text-up" : "text-down"}`}>{r.side}</td>
                <td className="px-3 py-2 font-mono">{pxFull(r.entry)}</td>
                <td className="px-3 py-2 font-mono">{pxFull(r.sl)}</td>
                <td className="px-3 py-2 font-mono">{pxFull(r.tp)}</td>
                <td className={`px-3 py-2 ${r.hasil === "TP" ? "text-up" : r.hasil === "SL" ? "text-down" : "text-muted"}`}>{r.hasil}</td>
                <td className="px-3 py-2 font-mono">{r.R == null ? "–" : r.R.toFixed(2)}</td>
                <td className="min-w-48 px-3 py-2 text-xs text-muted">{r.alasan}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-6 text-sm text-muted">Belum ada baris.</p>}
      </div>
      {rows.length > 0 && <p className="mt-2 text-xs text-muted">Alasan tersimpan bersama harga. Nilai ulang memakai jam 1H setelah waktu catat, dengan SL didahulukan bila satu jam menyentuh keduanya.</p>}
    </section>
  );
}
