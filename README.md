# ASGRA Mesin 2

Mesin analisis crypto dengan gerbang kualitas. Dipublikasikan ke **GitHub Pages**
lewat **GitHub Actions** (bukan Vercel).

## Deploy

1. Push repo ke GitHub (branch `main` atau `master`).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** (sekali saja).
3. Setiap push menjalankan `.github/workflows/deploy.yml`; bisa juga dijalankan
   manual dari tab **Actions → Deploy to GitHub Pages → Run workflow**.

Alamat situs: `https://<owner>.github.io/<repo>/` (atau `/` untuk repo
`<owner>.github.io` / domain kustom). Base path diambil otomatis dari
`actions/configure-pages`.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Dev server (TanStack Start) di `0.0.0.0:8080` |
| `npm run build` | Build statis GitHub Pages → `dist/` |
| `npm run preview` | Sajikan `dist/` di `127.0.0.1:8081` |
| `npm test` | Tes skrip & engine |

Coba build lokal dengan base path seperti di Pages:

```sh
PAGES_BASE_PATH=/nama-repo/ npm run build && npm run preview
```

## Kontrak dengan monitor (monitorv2)

Dashboard <https://triasnugra.github.io/monitorv2/> membaca halaman ini lewat browser. Jangan ubah
penanda di bawah tanpa memeriksa `docs/VERIFIED.md` di repo monitorv2:

| Penanda | Dipakai monitor untuk |
| --- | --- |
| `#go`, teks tombol persis **Scan ulang** | memicu scan |
| `table#jt` dengan header `Waktu Aset Arah Entry SL TP Hasil R Alasan`, selalu ada di DOM (di dalam `#jr`, disembunyikan di luar tab Jurnal) | **Jurnal** |
| `#out article.c` berisi `.t`, `.bd.L/.S`, `.g4 > div > span` (`Entry limit`, `SL x%`, `TP 2R`), `.m`, `.sz` | **Setup** siap eksekusi (hanya kartu yang lolos gerbang) |
| kartu pantauan / ditolak berkelas `reject-watch` / `reject` | dihitung ditolak, tidak dicatat |
| `#st` berisi `Selesai: N koin punya setup` (hanya setelah scan selesai) | menandai bahwa daftar Setup, termasuk yang kosong, terkonfirmasi |

Aturan lain: waktu jurnal selalu berzona (`YYYY-MM-DD HH:MM UTC`); harga memakai 7 angka signifikan
(`pxFull`) supaya level entry cocok dengan candle; selama scan ada detak 1 detik di `#st` agar monitor
tidak membaca halaman sebelum scan selesai. Jurnal tersimpan di `localStorage` per browser, jadi monitor
mencatat setup sejak scan pertamanya (browser runner selalu mulai kosong).
