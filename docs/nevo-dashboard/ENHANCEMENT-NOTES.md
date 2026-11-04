# ENHANCEMENT-NOTES — Catatan Penting TIFA untuk Web Monitoring Nevo

> Catatan dari sesi bedah kode TIFA (3–4/11/2026), untuk menyempurnakan dashboard monitoring Nevo yang "masih belum benar". Urutan = prioritas. Setiap item: pola TIFA → status Nevo → aksi.

## 1. Koneksi runtime dari `/settings` (server-side) — dasar semuanya
- **TIFA**: `lib/settings.ts` membaca `data/settings.json` per-call, env sebagai default; tanpa hardcode/localStorage. Identitas per instance tunggal.
- **Nevo**: sudah dianut redesain 4B — ✅. **Aksi**: jaga pola ini untuk SETIAP fitur baru; tidak boleh ada URL/port/token yang menghardcode.

## 2. Sesi WS: daur hidup + pelajaran duplicate
- **TIFA**: endpoint turn-on/turn-off dengan lock per email; `connectWs` memakai `handshakeTimeout: 8000` (fix #1, akar masalah hang 8.1s).
- **Pelajaran penting**: SI dobel → gateway reject + close 4002 (*self-kill*, bisa terjadi juga di socket sama). `force:true` lolos validator dan menendang sesi zombie (close 4001). WAJIB tutup semua sesi WS Postman sebelum Turn On agar slot `ui_id` tidak berebut.
- **Fix #2 TIFA (backlog)**: singleton koneksi `globalThis.__tifaWsClientState` + guard `siSentOn` + `force:true` saat SI ulang — desain lengkap tersimpan, aktifkan hanya bila `DUPLICATE_UI_ID` kambuh.
- **Nevo**: gateway sudah punya downlink/uplink — ⚠️. **Aksi**: rancang singleton koneksi **dari awal** di frontend/BFF supaya HMR/dev tidak menghasilkan koneksi kembar; terapkan handshakeTimeout; siapkan proteksi SI dobel sejak hari pertama. Jangan ulangi kesalahan sama.

## 3. Token JWT: alur otomatis, bukan manual
- **TIFA**: `fetchJwtToken()` login BE pakai env `ROBOT_USERNAME`/`ROBOT_PASSWORD` → JWT 24 jam → SI UI wajib token (`validateToken` di gateway) → turn-off membuang token → fetch ulang saat turn-on. Expired cukup ditangani recycle Turn Off→Turn On.
- **Nevo**: transplan penuh ke TOKEN-FLOW.md. **Aksi**: detail di `TOKEN-FLOW.md` (folder ini).

## 4. Skema monitoring `h_*`
- **TIFA**: tabel `h_*` — battery, command_log, connection_log, state, ws_traffic — jadi sumber riwayat & notifikasi.
- **Nevo**: ❌ belum ada. **Aksi**: desain minimal dulu (state + battery + command log + connection log), sinkron dengan `docs/api-contracts/monitoring-events.md`, baru bangun halaman monitoring. Jangan buat UI dulu tanpa skema.

## 5. Notifikasi per device + robot-ready toast
- **TIFA**: notifikasi per device; robot-ready toast memfilter per grup (kode hardcode lama TIFA-001/002 hanyalah filter teks lama — di grouping yang benar murni regex).
- **Nevo**: ❌ belum. **Aksi**: notifikasi berbasis event uplink/status dari gateway lewat SSE; filter per device/grup dari DB (bukan hardcode).

## 6. Realtime via SSE relay BFF
- **TIFA**: browser menerima event lewat SSE relay dari BFF — bukan WS langsung.
- **Nevo**: sudah jalan untuk sebagian halaman — ⚠️. **Aksi**: konsisten; semua data realtime baru lewat BFF/SSE. Arsitektur BFF = satu pintu keluar ke gateway internal.

## 7. Teleop
- **TIFA**: TeleopDpad tombol + WASD per `robot_id` grup, teleop-done, map select, TALK_ON/OFF, origin_id, antrean perintah DB saat WS mati.
- **Nevo**: dasar tombol+WASD sudah ada di `/robots` — ⚠️. **Aksi**: lanjutkan per FEATURE_MAP_4B; fitur tambahan (map, TALK, antrean) kontrak dulu. Perintah ke robot fisik **selalu butuh izin owner**; pengujian hanya sim mode.

## 8. Uji: e2e + bukti per fitur
- **TIFA**: `e2e.mjs` + Postman + dokumentasi bukti G1–G4 per tahap integrasi.
- **Nevo**: pola e2e ada di medical-ws; docs bukti belum — ⚠️. **Aksi**: setiap fitur baru wajib punya bukti uji terdokumentasi (lihat `UJI-INTEGRATION.md`); label `[MOCK]`/`SIMULATED` dari kode.

## 9. Rumah kebersihan (house rules)
- `data/settings.json` tidak ikut PR/deploy (identitas per instance; multi-node boleh online bersamaan dengan slot beda).
- Secret hanya di `.env`; token lewat header; log token maksimal 4 karakter.
- Kontrak berubah = jelaskan + catat + selaraskan Postman/checklist, bukan diam-diam.

## Backlog opsional (dari TIFA, terapkan saat relevan)
- `ensureFreshToken()`: cek klaim `exp` sebelum SI; auto-fetch bila sisa < ~1 jam. Baru dikerjakan kalau recycle manual terasa merepotkan di praktik.
