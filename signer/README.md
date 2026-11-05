# Harukaze48 — Partner Signer (OshiGO)

Signer kecil (Node.js, tanpa dependency) yang menandatangani request ke OshiGO
Partner Streaming dan memanggil `https://st.oshigo.web.id`.

## Kenapa terpisah dari Worker?

OshiGO **mewajibkan request datang dari IP server yang di-whitelist**, dan IP itu
ikut ditandatangani (`subkey = HMAC(SECRET, "hari|KEY_ID|SERVER_IP")`). IP keluar
Cloudflare Workers berganti-ganti, jadi tidak bisa dipakai. Signer ini dijalankan
di host ber-IP statis, mendengarkan di `127.0.0.1`, lalu diekspos sebagai
`https://ap.harukaze48.my.id` lewat reverse proxy. Cloudflare Worker memanggilnya
dengan header rahasia `X-Signer-Token`.

Setiap panggilan ke OshiGO selalu membawa `Origin`/`Referer` = `https://harukaze48.my.id`.

## Jalankan

```bash
cd signer
cp .env.example .env          # isi PARTNER_KEY_ID, PARTNER_SECRET, SIGNER_TOKEN
node server.mjs               # butuh Node 18+
```

Penting soal IP: isi `PARTNER_SERVER_IP` dengan IP publik host ini, dan **daftarkan
IP itu di dashboard OshiGO**. Kalau dikosongkan, signer auto-deteksi IP keluarnya
saat start (lihat log) — daftarkan nilai itu. Kalau IP tidak terdaftar, OshiGO
membalas `SIGNATURE_REJECTED` / `ORIGIN_NOT_ALLOWED`.

Supaya tetap jalan setelah reboot, pakai process manager (systemd/pm2). Contoh
systemd singkat:

```ini
[Service]
WorkingDirectory=/path/ke/signer
ExecStart=/usr/bin/node server.mjs
Restart=always
```

## Ekspos sebagai ap.harukaze48.my.id

Arahkan domain ke `127.0.0.1:8788`. Mis. nginx:

```nginx
location / { proxy_pass http://127.0.0.1:8788; proxy_set_header Host $host; }
```

Atau Cloudflare Tunnel (`cloudflared`) ke `http://127.0.0.1:8788` — IP keluar yang
dipakai OshiGO tetap IP host ini selama `fetch` keluar langsung (tunnel hanya untuk
inbound), jadi aman.

## Hubungkan ke Worker

Set token yang sama di Worker:

```bash
npx wrangler secret put SIGNER_TOKEN      # nilai sama dengan di signer/.env
```

Worker memakai `PARTNER_SIGNER_BASE` (default `https://ap.harukaze48.my.id`) untuk
memanggil `POST /session` di signer ini.

## Endpoint signer (dipanggil Worker, butuh header `X-Signer-Token`)

| Method & path | Fungsi |
| --- | --- |
| `GET  /health` | Cek hidup (tanpa token) |
| `POST /session` | Buat sesi penonton (body: `show_slug`, `viewer_id?`, `ttl?`) |
| `POST /session/revoke` | Cabut sesi |
| `GET  /shows` | Daftar show + status akses |
| `GET  /usage` | Sisa kuota & estimasi tagihan |

`/session` memetakan slug situs (slug IDN Plus) ke `show_slug` OshiGO: cocok persis
→ `SHOW_SLUG_FALLBACK` → satu-satunya show yang entitled.

## Uji cepat

```bash
curl -s localhost:8788/health
curl -s localhost:8788/shows -H "x-signer-token: <SIGNER_TOKEN>"
```
