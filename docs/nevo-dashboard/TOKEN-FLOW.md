# TOKEN-FLOW — Alur Autentikasi Nevo (transplan pola tifa-web)

> Pola asal: tifa-web (`lib/wsClient.ts` + `app/api/ws/session/route.ts`), diverifikasi dari kode 3–4/11/2026. Prinsip: token **otomatis** diperbarui oleh aplikasi — tidak ada generate manual di server.

## Mekanisme

1. **Turn-on** → aplikasi ambil token dari header Authorization (session), atau bila kosong → `fetchJwtToken()` otomatis `POST {BE_URL}/auth/login` memakai `ROBOT_USERNAME`/`ROBOT_PASSWORD` dari env.
2. BE mengeluarkan JWT valid **24 jam** (klaim `exp`) → disimpan di `data/settings.json` server + in-memory.
3. Gateway memvalidasi token pada setiap SI **type UI** (`validateToken`) — tanpa JWT valid, SI UI ditolak. SI **type ROBOT** tidak membutuhkan JWT (per kebijakan gateway; identifikasi lewat `robot_id`).
4. **Turn-off** → `disconnectWs()` membuang token (`jwtToken: undefined`) → token di-fetch ulang pada turn-on berikutnya.

## Ketika token expired (24 jam)

- SI UI mulai gagal validasi → recycle **Turn Off → Turn On** → `fetchJwtToken()` login ulang → token baru.
- Tidak perlu cron atau generate manual di server. Cukup pastikan env kredensial ada di server.

## Enhancement opsional (backlog)

`ensureFreshToken()` — sebelum kirim SI, cek klaim `exp`; bila sisa umur < ~1 jam → auto-fetch. Tambahkan hanya jika recycle manual terasa merepotkan. (Untuk Nevo: boleh didesain sejak awal karena singleton koneksi dirancang dari awal — lihat ENHANCEMENT-NOTES #2.)

## Aturan keamanan (dari AGENTS.md, berlaku di Nevo)

- Kredensial hanya di `.env` server/lokal — tidak pernah dicommit atau dicatat di chat (aturan 4/7).
- Token dikirim via **header**, bukan query param/URL (aturan 5).
- Token di log: **hanya prefix 4 karakter** (aturan 7).
- Apa pun yang menyentuh kontrak auth Nevo → update `docs/api-contracts/` dulu + catat keputusan (aturan 6).
