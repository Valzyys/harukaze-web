# Harukaze48

Ruang nonton show theater JKT48. Pengunjung **tidak perlu akun**: admin mendaftarkan email
pembeli (per show atau per durasi), lalu pembeli cukup mengetik email itu di pintu masuk
ruang nonton.

- Frontend: React + Vite, animasi GSAP (ScrollTrigger, SplitText)
- Backend: Cloudflare Worker (`worker/index.js`) + **D1** sebagai storage
- Stream: sesi partner OshiGO lewat **signer** (`signer/`), playback/resume ke `https://st.oshigo.web.id/api/partner/...`
- Jadwal show: IDN Live Plus via JKT48Connect (tidak diubah)

> Stream perlu **signer** yang jalan di host ber-IP statis (lihat `signer/README.md`).
> OshiGO mewajibkan IP ter-whitelist, jadi tidak bisa dari Worker. Signer menandatangani
> request, memaksa `Origin`/`Referer` ke `harukaze48.my.id`, dan memanggil `st.oshigo.web.id`.

## Deploy (sekali jalan)

```bash
npm install
npx wrangler login
npm run deploy
```

`npm run deploy` = `vite build && wrangler deploy`. Pada deploy pertama, wrangler **membuat
database D1 `harukaze-db` dan memasang binding `DB` secara otomatis** (tidak perlu
`database_id`). Tabel dibuat sendiri oleh Worker saat request pertama — tidak ada migrasi
manual. Setelah itu buka `/admin` dan login dengan **username `kaze`, password `haru`**.
Ganti password lewat **Admin → Pengaturan** (disimpan sebagai hash di D1). Login dikunci 15 menit
setelah 5 kali gagal.

### Variabel (opsional)

| Nama | Jenis | Default | Keterangan |
| --- | --- | --- | --- |
| `PARTNER_ORIGIN` | var | `https://st.oshigo.web.id` | Origin partner untuk playback & resume |
| `PARTNER_SIGNER_BASE` | var | `https://ap.harukaze48.my.id` | URL signer yang dipanggil Worker (`POST /session`) |
| `SIGNER_TOKEN` | secret | — | Token rahasia Worker→signer (sama dengan `signer/.env`) |
| `ADMIN_USERNAME` | var/secret | `kaze` | Username admin |
| `ADMIN_PASSWORD` | secret | `haru` | Password admin default (dipakai selama belum diganti dari panel) |
| `APP_SECRET` | secret | dibuat otomatis di D1 | Kunci tanda tangan token |
| `VITE_PARTNER_ORIGIN` | build env | `https://st.oshigo.web.id` | Origin partner di sisi browser |

```bash
npx wrangler secret put ADMIN_PASSWORD
```

## Alur akses

1. Pembeli menghubungi admin (link kontak diatur di **Admin → Pengaturan**).
2. Admin menambah akses di **Admin → Akses email**:
   - **Per show** — pilih show dari IDN Live Plus, berlaku sampai show selesai (+6 jam) atau +1/+3 hari.
   - **Per durasi** — semua show selama 1/3/7/14/30 hari atau jumlah hari kustom.
   - Batas perangkat per email (default 1). Admin bisa reset perangkat, perpanjang, cabut, hapus.
3. Pembeli membuka `/live/<slug>` → ketik email → Worker memeriksa D1, mengikat perangkat, dan
   memberi token bertanda tangan (maks. 6 jam) → Worker meminta sesi ke signer → browser
   menukar `playback_url` di `st.oshigo.web.id`.

## Pengembangan lokal

```bash
npm run build && npm run dev:worker   # Worker + D1 lokal di :8787
npm run dev                           # Vite di :5173, /api diproxy ke :8787
```

## Struktur

```
worker/index.js        API (/api/*) + D1 + penyajian SPA
migrations/            skema D1 (opsional, Worker juga membuatnya otomatis)
src/pages/             Home, Schedule (jadwal & tiket), Access (cek email), Room (ruang nonton), Admin
src/components/        Nav, Footer, Ticket, Countdown, Marquee, HlsPlayer, Chat
src/styles/            base (token visual), shell, home, pages, room, admin
```
