# Handoff 4B — Peta Fitur Redesain Web Monitoring (referensi `sstifa/`)

**Tanggal:** 3/11/2026 · **Tujuan:** acuan redesain UI `medical-dashboard-monitoring/frontend`
agar fitur mengikuti rancangan di folder `sstifa/` (10 screenshot) tanpa hardcode dan tanpa
menabrak kontrak yang sudah berjalan.

> **Sumber kebenaran tetap `docs/api-contracts/`.** Dokumen ini inventaris fitur, bukan kontrak.
> Jika desain `sstifa/` butuh endpoint baru, kontrak harus didiskusikan dan dicatat dulu
> (AGENTS.md aturan 6). Jangan membuat endpoint/sendiri di UI.

## 1. Yang SUDAH ada di dashboard (jangan dibangun ulang)

Referensi design `sstifa/` memuat: pendaftaran robot, dashboard per-robot/per-misi,
pengaturan speed, teleop, start mapping dari web. Status per fitur:

| Fitur `sstifa/` | Status di dashboard sekarang | Endpoint backend |
|---|---|---|
| Pendaftaran robot | ✅ `/robots/registry` — form 3 field (validasi `robotId` 3–64, pattern `[A-Za-z0-9_.\-]`); uji live G1/G2 di `docs/testing-postman-simrs-web-monitoring.md` | `GET /api/v1/robots/registry`, `POST /api/v1/robots` (role ADMIN) |
| Pilih robot (per-robot) | ✅ `/robots` — pemilih target dari telemetri WS | telemetri via BFF `/api/ws/stream` |
| Detail misi (per-misi) | ✅ `/missions`, `/missions/[id]`, `/missions/create` | `MissionApi`: `GET/POST /missions`, `GET/POST /missions/{id}/cancel`, `POST /missions/{id}/reassign` dst. (lihat kontrak) |
| Ubah speed | ✅ `/robots` — input + `CMD_SET_SPEED` | `POST /robots/{robotId}/commands` |
| Teleop | ✅ `/robots` — tombol arah + `CMD_TELEOP_DRIVE` | idem |
| Cancel misi / pulang dock | ✅ `/robots` — `CMD_CANCEL_MISSION`, `CMD_RETURN_TO_DOCK` | idem |
| Peta + waypoint + rooms | ✅ `/maps` — import ROS/SIMRS, aktifkan, CRUD+toggle waypoint, daftar ruangan | `MapApi`: `POST /maps/import`, `POST /simrs-mappings/import`, `GET /mappings`, `GET /maps/{id}/metadata|image`, `POST /maps/{id}/activate`, `GET/POST/PUT/DELETE/PATCH /maps/{mapId}/waypoints…`, `GET /rooms` |
| Notifikasi/laporan/pengguna/pengaturan | ✅ halaman ada (`/notifications`, `/reports`, `/users`, `/settings`, `/account`) | sesuaikan saat redesain |

Batas nilai yang **wajib dipertahankan UI** (kontrak `robot-command.md` §3):
`CMD_SET_SPEED` `speed` **0..2 m/s**; `CMD_TELEOP_DRIVE` `linear` **-1..1**, `angular` **-2..2**.
Jangan longgarkan di klien sebelum kontrak berubah.

## 2. GAP — beLUm ada di mana pun (minta desain, kontrak dulu)

1. **Start mapping dari web (SLAM/explore).** Tidak ada command maupun endpoint untuk *memulai*
   mapping — hanya event uplink `MAPPING_COMPLETE`/`ROBOT_STUCK` yang sudah dialirkan gateway.
   Yang perlu kalau ingin fitur ini: command baru (mis. `CMD_START_MAPPING`) pada kontrak
   `robot-command.md` §3 + eksekutor di adapter robot + tombol UI. **Jangan implementasi
   sebelum kontrak ditambah** — ini perubahan lintas fase.
2. **Perintah ke robot fisik.** Saat ini `ROBOT_MODE` lain selain `sim` diblok `UnavailableRobotAdapter`
   (503 "belum memiliki adapter operasional") — empat command dieksekusi `SimulatedRobotService`. Downlink
   TIFA UI→robot belum terimplementasi (gate di `robot-ws-tifa.md` §5–§6: mapping command → ROS/controller,
   auth, ACK/timeout, dedupe `commandId`, watchdog teleop, uji disconnect/reconnect).
   Soal **robot real, lihat §4** — jangan klaim siap servo/fisik sebelum gate ini lulus.
3. Label `[MOCK]`/`SIMULATED` harus tetap dihasilkan sumber data (aturan 1) — redesain tidak boleh
   menghapus label dari kartu telemetri.

## 3. Aturan non-hardcode saat merapikan UI

Semua nilai koneksi dari env, bukan literal di kode (AGENTS.md aturan 4):

| Nilai | Dibaca dari | Dipakai oleh |
|---|---|---|
| REST backend | `BACKEND_URL` | BFF `/api/proxy/[...path]` dan `/api/ws/session` |
| WS gateway event | `WS_BACKEND_URL` (`ws://host:8083/ws/v1/deliveries`) | BFF `/api/ws/stream` (SSE) |
| Token WS | `WS_AUTH_TOKEN` | hanya server (BFF); TIDAK dikirim ke browser |
| Origin relay browser | `NEXT_PUBLIC_WS_RELAY_URL` (default `/api/ws/stream`) | klien |

- `NEXT_PUBLIC_*` **di-inline saat build**: ganti nilai → rebuild, bukan restart.
- Halaman `/settings` (SIMRS URL / WS URL / toggle) **kosmetik**: nilai hanya ke
  `localStorage 'nevo_connection_settings'`, tidak ada pembaca. **Jangan jadikan dasar fitur
  redesain.** "Test Connection" hanya membuktikan `BACKEND_URL` menjawab — bukan bukti URL yang
  diketik dipakai. Kalau redesain ingin pengaturan koneksi yang benar-benar aktif, itu perubahan
  desain baru (tulis env tiap landing, atau fitur khusus) — bukan pakai form lama.
- Redact token di UI/log: hanya 4 karakter pertama (aturan 7).

## 4. Konek robot real — apa yang harus disamakan, apa yang belum bisa

**Satu gateway yang sama.** Robot fisik terhubung ke `medical-ws` yang sama (bukan WS terpisah),
kontrak `robot-ws-tifa.md`:

1. Koneksi: `ws://<host>` (atau `wss://` di server) + `Path` WS sama, header
   `Authorization: Bearer $WS_AUTH_TOKEN` (token gateway; salah → close `4401`).
2. Handshake SI: kirim `{"code":"SI","data":{"type":"ROBOT","robot_id":"nevo-01"}}` →
   server `ACK_SOFT`; `robot_id` duplikat → close `4002`.
3. Uplink frame `{code,data}`: `STATUS`, `ACK`, `POSITION`, `BATTERY`, `GOAL_COMPLETE`,
   `MAPPING_COMPLETE`, `ROBOT_STUCK` (di-enrich `robot_id`+`timestamp`, lalu Kafka+broadcast).
4. Downlink (empat command) ke robot fisik **belum jalan** — gate §5–§6 `robot-ws-tifa.md` +
   `UnavailableRobotAdapter` (lihat §2 poin 2). Robot real yang sudah menyala akan terlihat
   telemetrinya di dashboard, tetapi tombol command belum memengaruhi robot fisik sampai
   adapter + downlink selesai. Ini blocker yang disengaja dan tercatat, bukan bug.

Prasyarat deploy gateway (server yang sama dengan SIMRS): set `WS_AUTH_TOKEN` (kosong = semua
koneksi ditolak), `INTERNAL_PUBLISH_SECRET`, `KAFKA_ENABLED`/`KAFKA_BROKERS` bila Kafka dipakai,
dan `NEXT_PUBLIC_WS_URL`/env BFF di dashboard server + rebuild.
