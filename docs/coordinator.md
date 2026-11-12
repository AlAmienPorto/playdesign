# Koordinator Playdesign

Hermes sebagai koordinator untuk proyek `kantor.playdesign`: bukan pengganti
runner, tapi lapisan pengawas di atasnya — membaca keadaan nyata, memutuskan
apa yang perlu ditindak, menjalankan tindakan yang aman, dan melapor hanya
kalau ada yang perlu diketahui manusia.

Sebelum lapisan ini ada, tiga pipeline berjalan sendiri-sendiri dan kegagalan
hanya ketahuan kalau ada yang kebetulan membuka UI. Contoh nyata: job
`vj-mw3w0kat-i3iz3p` tertahan `queued` berjam-jam tanpa ada yang memberi tahu.

## Perintah

```bash
python3 scripts/coordinator.py status    # keadaan sekarang, tanpa tindakan
python3 scripts/coordinator.py sweep     # deteksi + bertindak + catat (default cron)
python3 scripts/coordinator.py report    # ringkasan lengkap untuk digest harian
python3 scripts/coordinator.py json      # keluaran mentah untuk debugging
python3 scripts/coordinator.py sweep --dry-run   # lihat keputusan tanpa mengeksekusi
```

Tanpa argumen, `coordinator.py` menjalankan `sweep` — itu yang dipanggil cron.

## Pipeline yang diawasi

| Pipeline | Sumber data | Status yang dilacak |
|---|---|---|
| Video | `video_jobs` (API `/api/video/jobs`) | `queued` → `rendering` → `uploading` → `done` / `failed` |
| Scrape | `scrape_requests` | `pending` → `running` → `done` / `failed` |
| Agent | `runs` | `queued` → `running` → `owner_review` |
| Cron | `~/.hermes/cron/jobs.json` | `last_run_at` vs jadwal — mendeteksi runner yang berhenti dipanggil |

## Ambang dan kebijakan

Nilai ada di `DEFAULT_THRESHOLDS` dan `MAX_ATTEMPTS` di `scripts/coordinator.py`.

| Kondisi | Ambang | Tingkat | Tindakan |
|---|---|---|---|
| Video menunggu di antrean | > 10 menit | 🟠 warn | jalankan `video_render_runner.py` |
| Video `rendering`/`uploading` tanpa progres | > 25 menit | 🔴 critical | tandai `failed` dengan alasan macet |
| Video gagal, percobaan < 2, error sementara, < 3 jam | — | 🟠 warn | kembalikan ke `queued` (attempts naik) |
| Video gagal 2× | `MAX_ATTEMPTS` | 🔴 critical | tidak diulang; tunggu keputusan |
| Video gagal karena akses (401/403) | — | 🔴 critical | tidak diulang; periksa token |
| Video gagal karena kuota (429) | — | 🟠 warn | tidak diulang; tunggu kuota pulih |
| Video gagal > 3 jam lalu | `RETRY_WINDOW_MIN` | 🔴 critical | tidak diulang; brief dianggap basi |
| Scrape `pending` | > 15 menit | 🟠 warn | jalankan `scrape_queue_runner.py` |
| Scrape `running` | > 20 menit | 🔴 critical | tandai `failed` |
| Run agent `queued` | > 30 menit | 🟠 warn | jalankan `run_executor.py` |
| Cron tidak jalan | > 3× jadwalnya | 🔴 critical | tidak ada — cron mati butuh manusia |
| Kuota video 1 jam | ≥ 8 dari 10 | 🔵 info | tidak ada — peringatan dini |
| Kuota video 1 jam | ≥ 10 dari 10 | 🟠 warn | tidak ada — 429 sudah di depan mata |

Tiga keputusan penting di balik tabel ini:

1. **Kegagalan akses dan kuota tidak diulang otomatis.** Mengulang job yang
   ditolak token hanya membakar kuota; yang dibutuhkan manusia, bukan retry.
2. **Job basi tidak diulang.** Merender ulang brief berumur belasan jam
   menghasilkan video yang isinya sudah tidak relevan.
3. **Menjalankan runner itu idempoten.** Runner mengambil job `queued` sendiri,
   jadi memanggilnya dua kali tidak menggandakan pekerjaan. Guard `pgrep`
   mencegah dua proses paralel.

## Buku kerja (D1)

Migrasi: `migrations/0015_coordinator.sql`.

```
coordinator_alerts   id ("<kind>:<ref>"), kind, ref, severity, message,
                     first_seen, last_seen, count, resolved_at
coordinator_actions  id, at, action, ref, note        (append-only)
```

- Satu baris per masalah. Alert yang sama tidak dikirim ulang: `sweep` hanya
  bersuara kalau ada masalah **baru** atau tindakan yang dijalankan. Masalah
  lama yang masih terbuka diingatkan lewat digest harian.
- Masalah yang sudah hilang diisi `resolved_at`, tidak dihapus — riwayat tetap
  bisa dibaca.
- Kalau D1 tidak bisa dihubungi, `sweep` tetap jalan dan mencetak peringatan ke
  stderr; buku kerja yang gagal tidak boleh mematikan koordinator.

## Cron

| Job | ID | Jadwal | Skrip |
|---|---|---|---|
| Playdesign Koordinator (sweep) | `654abb1cd687` | `*/5 * * * *` | `coordinator.py` |
| Playdesign Koordinator (digest) | `3783018d92bb` | `30 8 * * *` | `coordinator_digest.py` |

Keduanya `no_agent` — tidak memakai token model. `sweep` senyap kalau semua
sehat (stdout kosong = tidak ada pesan terkirim), `digest` selalu melapor.

Skrip harus ada di `~/.hermes/scripts/` — cron Hermes **menolak symlink** yang
menunjuk keluar direktorinya, jadi berkasnya disalin:

```bash
python3 scripts/coordinator.py install
```

Supaya salinan tidak tertinggal dari repo, `sweep`/`status` membandingkan isi
berkas dan memunculkan peringatan `coordinator_stale` kalau berbeda. Setiap
kali `scripts/coordinator.py` diubah, jalankan `install` lagi.

## Uji

```bash
python3 -m unittest scripts.tests.test_coordinator   # 22 tes, murni tanpa jaringan
python3 -m unittest discover -s scripts/tests        # seluruh suite Python
```

Logika keputusan (`analyze`) sengaja murni: masukannya baris data + waktu,
keluarannya daftar `Finding`. Tidak ada jaringan, tidak ada D1, sehingga
aturan bisa diuji tanpa menyentuh produksi.

## Batasan yang masih terbuka

- **Masih polling 5 menit.** Webhook dari Worker saat job dibuat akan lebih
  cepat, tapi menambah permukaan endpoint; belum dikerjakan.
- **Belum ada heartbeat per job.** Job yang prosesnya mati di tengah hanya
  terdeteksi dari `started_at`, bukan dari sinyal proses.
- **Cron mati hanya dilaporkan, tidak dihidupkan ulang.** Menghidupkan ulang
  scheduler dari dalam scheduler bukan lingkaran yang sehat.
- **Server ini titik tunggal kegagalan.** Kalau mesin mati, cron berhenti dan
  tidak ada yang memberi tahu. Buku kerja di D1 tetap utuh, tapi tidak ada
  yang membacanya sampai mesin hidup lagi.
- **Kuota job API 10/jam baru diperingatkan, belum dijadwalkan ulang.** Job
  yang tertahan kuota tetap menunggu, tidak otomatis dicicil ke jam berikutnya.
