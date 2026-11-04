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

1. **Start mapping dari web (SLAM/explore) — ✅ selesai via jalur TIFA 4/11/2026.**
   Tidak diperlukan command backend baru; mapping memakai downlink relay verbatim
   `MAPPING_START/STOP/SAVE/FLAG` + `MAP_SELECTED {map_id}` (whitelist
   `DOWNLINK_CODES`, kontrak `robot-ws-tifa.md` §5a) dari `/robots` lewat
   `POST /api/ws/command`. Backend tidak ikut jalur ini (relay UI→robot langsung);
   kontrak `robot-command.md` tidak berubah.
2. **Perintah ke robot fisik — sudah jalan (4B lanjutan).** Gate "real" `robot-ws-tifa.md` §6
   dibuka atas kesepakatan owner (3/11/2026); §5–§6 kontrak diperbarui. Rantai downlink kini
   lengkap: backend `RealRobotAdapter` (aktif `ROBOT_MODE=real`, default `sim`) →
   `POST /internal/publish` (`ROBOT_COMMAND`) → gateway memilih robot tersambung dan mengirim
   frame `ROBOT_COMMAND`; offline → gateway langsung hasil `REJECTED/UNKNOWN_ROBOT`. Validasi
   parameter (speed 0..2, teleop linear -1..1 / angular -2..2) dilakukan **di backend** sehingga
   parameter invalid tak pernah sampai robot fisik. Sisi konfigurasi tersambung: robot
   tersambung terlihat IDLE+`simulated:false` di `GET /robots` via `GET /internal/robots`
   gateway (`x-internal-secret` = `INTERNAL_PUBLISH_SECRET`).
   Catatan terbuka (tercatat di kontrak): hasil uplink `ROBOT_COMMAND_RESULT` baru sampai
   Kafka+WS; backend belum punya konsumen Kafka sehingga `t_robot_command.result` masih null.
3. Label `[MOCK]`/`SIMULATED` harus tetap dihasilkan sumber data (aturan 1) — redesain tidak boleh
   menghapus label dari kartu telemetri.

## 3. Aturan non-hardcode saat merapikan UI

Semua nilai koneksi dipakai dengan urutan: override runtime (disimpan server-side BFF,
`data/settings.json`, diubah dari halaman `/settings` oleh ADMIN) → default env — tanpa literal
di kode (AGENTS.md aturan 4). Legacy `localStorage 'nevo_connection_settings'` dihapus.

| Nilai | Default env | Override runtime (`/settings`) | Dipakai oleh |
|---|---|---|---|
| REST backend | `SIMRS_URL` (fallback lama `BACKEND_URL` masih dibaca) | `endpoints.simrsUrl` (back-compat baca key `backendUrl`, dibuang saat write-back) | BFF `/api/proxy/[...path]`, `/api/ws/session` |
| WS gateway event | `WS_BACKEND_URL` (`ws://host:8083/ws/v1/deliveries`) | `endpoints.wsUrl` | BFF `/api/ws/stream` (SSE) |
| Token WS | `WS_AUTH_TOKEN` | `wsToken` (server-side, tak pernah utuh ke browser) | hanya server (BFF) |
| Origin relay browser | `NEXT_PUBLIC_WS_RELAY_URL` (default `/api/ws/stream`) | — | klien |

- Halaman `/settings` kini **aktif**: Save = `POST /api/ws/session` `setConnection` (endpoints + token)
  → `setIdentity` bila UI ID diisi (identitas SI-UI relay: `ui_id` wajib, robot_id/map_id opsional)
  → selaraskan relay on/off → BFF melepas koneksi WS lama dan reconnect dengan konfigurasi baru,
  tanpa rebuild. "Test Connection" hanya validasi sintaks URL; konektivitas
  nyata terlihat dari status relay/aliran event setelah Save. UI ID relay wajib terisi agar
  `/api/ws/stream` tidak mengembalikan `UI_ID_NOT_SET`.
- `NEXT_PUBLIC_*` **di-inline saat build**: ganti nilai → rebuild, bukan restart (itulah alasan
  override runtime ada — tujuan 4B: koneksi bisa diganti dari web, gaya sstifa).
- Gateway internal backend (`GATEWAY_URL` di medical-backend) mengarah ke medical-ws untuk
  `GET /internal/robots` + downlink; header `x-internal-secret` = `INTERNAL_PUBLISH_SECRET`.
- Redact token di UI/log: hanya 4 karakter pertama (aturan 7).

## 4. Konek robot real — apa yang harus disamakan, apa yang belum bisa

**Satu gateway yang sama.** Robot fisik terhubung ke `medical-ws` yang sama (bukan WS terpisah),
kontrak `robot-ws-tifa.md`:

1. Koneksi: `ws://<host>` (atau `wss://` di server) + path WS sama; upgrade boleh
   anonim — auth asli di dalam SI. Bearer header tetap divalidasi bila dibawa
   (salah → close `4401`).
2. Handshake SI: kirim `{"code":"SI","data":{"type":"ROBOT","robot_id":"nevo-01"}}` →
   server `ACK_SOFT`; duplikat hidup → `ERROR/DUPLICATE_ROBOT_ID` (kick hanya bila
   sesi lama DEAD).
3. Uplink frame `{code,data}`: `STATUS`, `ACK`, `READY`, `POSITION`, `BATTERY`, `GOAL_COMPLETE`,
   `MAPPING_STATUS`, `MAPPING_COMPLETE`, `ROBOT_STUCK` (di-enrich `robot_id`+`timestamp`, lalu
   Kafka+broadcast ke semua sesi UI; roster gateway ikut diperbarui).
4. Downlink dua jalur (kontrak `robot-ws-tifa.md` §5).
   - **Teleop relay verbatim TIFA** (dashboard `/robots`): dari tombol hold + **WASD**
     10 Hz `{code:"TELEOP",data:{linear,angular,robot_id}}` via BFF
     `POST /api/ws/command` → sesi SI-UI relay → gateway → frame verbatim ke robot;
     lepas tombol = `{linear:0,angular:0}`. Mapping `MAPPING_START/STOP/SAVE/FLAG`
     + `MAP_SELECTED {map_id}` di jalur sama. Whitelist `DOWNLINK_CODES`.
   - **Empat command lama** ✅ jalan sejak 4B lanjutan: UI → backend (validasi +
     dedupe `commandId`) → `POST /internal/publish` (`ROBOT_COMMAND`) → gateway →
     frame ke robot; hasil `ROBOT_COMMAND_RESULT` → Kafka + dashboard. Robot
     menyala tetapi belum menyelesaikan handshake SI tidak menerima perintah
     (tidak ada frame dikirim; telemetri pun tak muncul). Batas param empat
     command tetap kontrak `robot-command.md` §3.

Prasyarat deploy gateway (server yang sama dengan SIMRS): set `WS_AUTH_TOKEN` (kosong = semua
koneksi ditolak), `INTERNAL_PUBLISH_SECRET`, `KAFKA_ENABLED`/`KAFKA_BROKERS` bila Kafka dipakai,
dan `NEXT_PUBLIC_WS_URL`/env BFF di dashboard server + rebuild.
