# Harukaze48

Ruang nonton show theater JKT48. Pengunjung **tidak perlu akun**: admin mendaftarkan email
pembeli (per show atau per durasi), lalu pembeli cukup mengetik email itu di pintu masuk
ruang nonton.

- Frontend: React + Vite, animasi GSAP (ScrollTrigger, SplitText)
- Backend: Cloudflare Worker (`worker/index.js`) + **D1** sebagai storage
- Stream: sesi partner OshiGO **ditandatangani langsung di Worker** (tanpa host signer terpisah),
  playback/resume ke `https://st.oshigo.web.id/api/partner/...`
- Jadwal show: IDN Live Plus via JKT48Connect (tidak diubah)

> Worker menandatangani request OshiGO (subkey harian HMAC), memaksa `Origin`/`Referer` ke
> `harukaze48.my.id`, dan memanggil `st.oshigo.web.id`. Isi secret `PARTNER_KEY_ID` &
> `PARTNER_SECRET`. **Catatan IP:** OshiGO menghitung tanda tangan dengan IP pemanggil yang ia lihat.
> Dari Cloudflare Worker ke `st.oshigo.web.id` (juga di Cloudflare), IP itu adalah
> `2a06:98c0:3600::103` — tetap, bukan IPv4 keluar Worker. Worker mempelajari IP yang benar
> otomatis (dan menyimpannya di D1), jadi `PARTNER_SERVER_IP` tidak wajib. Daftarkan IP itu dan
> domain `harukaze48.my.id` di dashboard OshiGO. Cek kapan saja lewat **Admin → Pengaturan →
> Koneksi OshiGO**.

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
| `PARTNER_ORIGIN` | var | `https://st.oshigo.web.id` | Host partner OshiGO (signing, playback & resume) |
| `PARTNER_KEY_ID` | secret | — | Key id partner OshiGO (wajib untuk stream) |
| `PARTNER_SECRET` | secret | — | Secret partner OshiGO (wajib untuk stream) |
| `PARTNER_SERVER_IP` | var | dipelajari otomatis | IP penandatangan (boleh beberapa, pisah koma). Dari Worker: `2a06:98c0:3600::103` |
| `SHOW_SLUG_FALLBACK` | var | — | show_slug OshiGO bila slug situs tak cocok (opsional) |
| `ADMIN_USERNAME` | var/secret | `kaze` | Username admin |
| `ADMIN_PASSWORD` | secret | `haru` | Password admin default (dipakai selama belum diganti dari panel) |
| `APP_SECRET` | secret | dibuat otomatis di D1 | Kunci tanda tangan token |
| `VITE_PARTNER_ORIGIN` | build env | `https://st.oshigo.web.id` | Origin partner di sisi browser |

```bash
npx wrangler secret put PARTNER_KEY_ID
npx wrangler secret put PARTNER_SECRET
# opsional: npx wrangler secret put ADMIN_PASSWORD
```

## Alur akses

1. Pembeli menghubungi admin (link kontak diatur di **Admin → Pengaturan**).
2. Admin menambah akses lewat salah satu cara di `/admin`:
   - **Link bypass (`Admin → Link bypass`)** — buat tautan langsung (`/b/<kode>` atau `/live/<slug>?bypass=<kode>`) tanpa perlu input email sama sekali. Bisa diatur untuk show mana (atau semua show), masa aktif link, batas perangkat per IP, serta batas jumlah IP (atau bebas IP).
   - **Akses email (`Admin → Akses email`)** — daftarkan email pembeli (per show atau per durasi) dengan batas perangkat per email.
   - Admin bisa salin link, perpanjang masa aktif, ubah batas perangkat/IP, reset perangkat & IP, cabut, atau hapus akses kapan saja.
3. Pembeli cukup membuka link bypass (`/b/<kode>`) untuk langsung masuk ke ruang nonton, atau membuka `/live/<slug>` dan memasukkan email terdaftar.

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
src/components/        Nav, Footer, Ticket, Countdown, Marquee, Player (resolusi), Chat
src/styles/            base (token visual), shell, home, pages, room, admin
```
