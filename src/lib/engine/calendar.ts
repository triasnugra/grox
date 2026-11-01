const FOMC = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];
const HOL = ["12-24", "12-25", "12-26", "12-31", "01-01"];

/** Alasan kalender yang menurunkan eksekusi menjadi pantauan. Kosong = hari biasa. */
export function calendarHolds(now = Date.now()): string[] {
  const d = new Date(now);
  const iso = d.toISOString().slice(0, 10);
  const md = iso.slice(5);
  const dw = d.getUTCDay();
  const tomorrow = new Date(now + 864e5).toISOString().slice(0, 10);
  const notes: string[] = [];
  if (FOMC.includes(iso) || FOMC.includes(tomorrow)) {
    notes.push("FOMC hari ini atau besok. Tidak ada order baru; noise berita bukan trigger.");
  }
  if (new Date(now + 864e5).getUTCMonth() !== d.getUTCMonth()) {
    notes.push("Hari terakhir bulan. Penutupan bulanan bukan tempat membuka posisi.");
  }
  if (HOL.includes(md)) notes.push("Libur bervolume tipis. Tidak ada order baru.");
  if (dw === 1) notes.push("Senin UTC: Monday range masih terbentuk. Tunggu hari berikutnya.");
  return notes;
}

export function infoAlerts(now = Date.now()): string[] {
  const d = new Date(now);
  const notes: string[] = [];
  if (d.getUTCDay() === 0) notes.push("Menjelang penutupan weekly, Senin 00:00 UTC.");
  return notes;
}
