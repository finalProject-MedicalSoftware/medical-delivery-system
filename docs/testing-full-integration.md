# Testing — Full Integration (F2 Sprint)

> Jalur default dokumen ini adalah demo lokal dengan data sintetis
> (`[MOCK]` / `SIMULATED`). Dokumen ini **bukan** bukti SIMRS klinis,
> ROS/Gazebo, atau robot fisik. Target pengujian robot tetap empat command:
> `CMD_CANCEL_MISSION`, `CMD_RETURN_TO_DOCK`, `CMD_SET_SPEED`,
> `CMD_TELEOP_DRIVE`, dengan gate terpisah untuk simulator → ROS/Gazebo → real.

## 0. Peta port & layanan

| Layanan | Port | Catatan |
|---|---|---|
| `medical-backend` (Spring Boot) | 8080 | REST facade; default `ROBOT_MODE=sim`, target berikutnya ROS/Gazebo lalu real |
| `medical-dashboard-monitoring/frontend` (Next.js) | 3000 | BFF proxy `/api/proxy/*` → backend :8080; **pemilik koneksi WS** ke medical-ws, relay SSE `/api/ws/stream` |
| `simrs-dummy/medical-simrs-web` (Next.js) | 3001 | DB PostgreSQL sendiri di :5433 |
| `medical-ws` | 8081 | Gateway WS `/ws/v1/deliveries` (Bearer server-side); bridge HTTP `POST /internal/publish` |

## 1. Menjalankan layanan

```bash
# 1) DB SIMRS (dari root workspace; pastikan port 5433 hidup)
nc -z localhost 5433

# 2) Backend, di medical-backend (:8080)

# 3) SIMRS
cd simrs-dummy/medical-simrs-web
npm install && npx prisma migrate dev && npm run seed # seed idempotent (upsert)
npm run dev                                            # :3001

# 4) Dashboard
cd ../medical-dashboard-monitoring/frontend
rm -rf .next && npm install && npm run build && npm run start   # :3000
# Env WS (server-side, .env.local): WS_BACKEND_URL=ws://127.0.0.1:8081/ws/v1/deliveries + WS_AUTH_TOKEN.
# Browser hanya menyentuh relay SSE /api/ws/stream (SSE default bila sesi ON; 409 bila OFF).
```

> **Cek port dulu** (`lsof -nP -iTCP:<port> -sTCP:LISTEN`). Saat verifikasi terakhir, **:8081 sudah dipakai `medical-ws`** — jangan jalankan instance kedua. Sesi relay dikendalikan dari halaman **Settings** dashboard (Turn ON/OFF, lock, pilih channel, kartu **Admin SIMRS** untuk config/reassign); state persist di `data/settings.json` (untracked, jangan dicommit).

Akun demo SIMRS (password semua: `demo12345`): `sysadmin`, `admin_simrs`, `dr_budi`, `apt_dewi`, `staf_farmasi`, `perawat_siti`, `admin_bangsal`, `multirole_user`, `monitoring_service`.

> **Wipe data demo (2026-10-27):** semua data transaksional demo sudah dihapus (`npm run wipe-demo`): resep/pengantaran/event/audit/pasien/obat. Hanya tersisa **auth + ward/room/bed**. Data mapping lama (`MRN-23131443` "Rayyyy", `SYN-MRN-003`) **hilang**; buat ulang dari awal via `/pasien/baru` & `/obat/baru` untuk E2E berikutnya.

> **Seed E2E cepat:** `npm run seed-e2e` (di SIMRS) membuat 3 pasien + 3 resep + 3 permintaan pengantaran **pending** (`DELIV-YYYYMMDD-0001…0003`, Rina/Bayu/Sari) yang siap dipakai sebagai manifest multi-misi. **Jalankan sekali** — seed berikutnya menambah permintaan baru (menumpuk, karena tiap run membuat resep + request baru). Reset: `npm run wipe-demo` lalu `npm run seed-e2e` sekali lagi. Backend mem-poll SIMRS ~30 dtk, jadi tunggu sebelum buka `/missions/create`.

## 2. Alur E2E via UI

1. **SIMRS (:3001)** — login `dr_budi` → buat pasien & obat dummy via `/pasien/baru` & `/obat/baru` (data lama sudah di-wipe; ward/room/bed `R-MAWAR-201/202` dll. masih ada dari seed) → buat resep untuk pasien baru → verifikasi (`apt_dewi`) → siapkan obat (`staf_farmasi`) → pengantaran dibuat / terjadwal.
2. **Dashboard (:3000)** — buka **Missions → New mission**:
   - Status peta: sumber `DUMMY-SIMRS` muncul dengan badge **"Peta Dummy"** (DUMMY map tidak mem-fetch preview — by design, MapViewer skip fetch untuk id `DUMMY-*`).
   - Waypoint dummy `DUMMY-WP-<roomCode>` tampil di peta & daftar (kodes ruang dari antrian pengantaran).
   - **Pilih pasien** dari antrian (kotak search nama/MRN; kartu antrian hanya item yang punya `requestCode`). Bisa **centang beberapa pasien sekaligus** → dispatch jadi beberapa misi (lihat §2b).
   - **Pilih tray compartment 0–5** — wajib; tombol dispatch terkunci bila kosong (validasi client), dan backend tetap tegas di server. (NEVO hanya punya 6 kompartemen fisik: 0–5.)
   - Antrian **tidak menampilkan** item yang sudah `MOCK_ARRIVED_AT_ROOM`, `MOCK_HANDOVER_CONFIRMED`, atau `CANCELLED` — yang tampil hanya yang masih butuh pengantaran.
   - `Request code` terisi otomatis bila masuk dari kartu antrian (`?req=`). Konfirmasi → dispatch → toast sukses, robot mulai bergerak (telemetry via WS).
   - Tombol **Cancel active mission** tersedia selama misi aktif.
   - Nama pasien & ruangan ikut tampil di `/missions` dan `/missions/[id]` (JOIN read-only ke cache SIMRS lewat `requestCode`).

### 2b. Multi-misi (antrian di backend)

Satu robot `NEVO-01` = satu misi aktif; sisanya **`QUEUED`** di antrian backend (bukan ditolak 409).

- Centang beberapa pasien di manifest, isi kompartemen per baris (`<select>` 0–5, tidak boleh dobel), lalu konfirmasi → dashboard mengirim dispatch **sekuensial** (berhenti di error pertama).
- Misi pertama `EXECUTING`, sisanya `QUEUED` dengan `queuePosition` 1, 2, … (tampil sebagai badge di `/missions` dan `/missions/[id]`; `queueLength` tampil di `/robots`).
- Saat misi aktif `SUCCEEDED`/`CANCELLED`, backend otomatis men-start misi `QUEUED` tertua (`created_at, id`). Tidak perlu dispatch ulang.
- Lifecycle: `SUBMITTED → BACKEND_ACCEPTED → QUEUED ⟳ → ROBOT_ACKNOWLEDGED → EXECUTING → SUCCEEDED/CANCELLED`; semua tercatat di `h_mission_event`.
- Mode manual (tanpa pasien, pilih waypoint + tray sendiri) tetap ada dan ikut antrian yang sama.
- `queuePosition` hanya terisi untuk `QUEUED`; misi `EXECUTING`/`SUCCEEDED` bernilai `null` (normal).
3. **SIMRS (:3001)** — buka `/pengantaran` → status bergeser mengikuti laporan monitoring (lihat §4).

## 3. Perintah robot via REST (Postman)

Base: `http://localhost:8080/api/v1`

| # | Method + Path | Body | Harapan |
|---|---|---|---|
| 1 | `GET /robots` | — | 200, list dengan `NEVO-01` |
| 2 | `POST /robots/NEVO-01/commands` | `CMD_CANCEL_MISSION` / `CMD_RETURN_TO_DOCK` / `CMD_SET_SPEED` / `CMD_TELEOP_DRIVE` sesuai params kontrak | 202; hasil `ROBOT_COMMAND_RESULT`; sim pass, ROS/Gazebo/real tetap blocked sampai adapter + safety gate lulus |
| 3 | `POST /missions` | `{"waypointId":"DUMMY-WP-R-MAWAR-202","roomCode":"R-MAWAR-202","requestCode":"REQ-…","compartmentNo":3}` | 2xx `EXECUTING` bila robot `IDLE`; 2xx **`QUEUED` + `queuePosition`** bila robot sedang bertugas; **400** bila waypoint salah/arg tidak sah |
| 3 | `POST /missions/{id}/cancel` | — | 200; misi batal, robot stop |
| 4 | `POST /robots/NEVO-01/commands` | `{"command":"CMD_CANCEL_MISSION"}` | 200; robot cancel |
| 5 | `POST /robots/NEVO-01/commands` | `{"command":"CMD_RETURN_TO_DOCK"}` | 200 bila robot `IDLE`; **`ROBOT_BUSY`** bila sedang bertugas (dock belum dikonfigurasi — di luar sprint ini) |

Lakukan #2 dua kali tanpa cancel → yang kedua **`QUEUED`** (antrian, bukan 409); kirim waypoint `DUMMY-WP-TIDAK-ADA` → **400**.

### 3a. Admin SIMRS (config + reassign)

| # | Method + Path | Body | Harapan |
|---|---|---|---|
| 1 | `GET /simrs/admin/config` | — | 200: `enabled`, `writeEnabled`, `baseUrl`, `pollIntervalSeconds`, `connectTimeoutMs`, `readTimeoutMs`, `writeMaxAttempts`, `configured` |
| 2 | `POST /simrs/admin/config` | objek penuh | 200, config diganti & dipersist ke `m_setting` (key `simrs.config`) |
| 3 | `PATCH /simrs/admin/config` | `{"pollIntervalSeconds":15}` | 200, hanya field terkirim yang berubah |
| 4 | `POST /simrs/admin/mission/reassign` | `{"missionId":"<uuid>","robotId":"NEVO-01"}` | 200 bila misi `QUEUED`; **409** bila bukan QUEUED; **404** bila misi tak ada; **400** bila `missionId`/`robotId` kosong |
| 5 | `POST /simrs/admin/mission/reassign-batch` | `[{missionId, robotId}, …]` | 200, array hasil per item (sukses/gagal tidak saling membatalkan) |

Config bertahan setelah restart backend (dibaca ulang dari `m_setting` pada startup).

### 3b. Sesi relay WS (Turn ON/OFF, lock) + SSE stream

Base dashboard (BFF): `http://localhost:3000`. Sesi persist di `data/settings.json`; GET tidak butuh body.

| # | Method + Path | Body | Harapan |
|---|---|---|---|
| 1 | `GET /api/ws/session` | — | 200: `conn`, `tokenPrefix` (4 char, mis. `beba••••`), `wsTarget`, `relayPath` |
| 2 | `POST /api/ws/session` | `{"action":"turnOn"}` | 200, `conn.on=true`; **500 `WS_AUTH_TOKEN_NOT_SET`** bila env kosong |
| 3 | `POST /api/ws/session` | `{"action":"lock","user":"admin"}` | 200, `lockBy="admin"` (lock bertahan lintas turnOn/turnOff) |
| 4 | `POST /api/ws/session` | `{"action":"turnOff"}` | 200, `conn.on=false`; subscriber SSE menerima tidak ada env baru |
| 5 | `POST /api/ws/session` | `{"action":"unlock"}` | 200, `lockBy=null` |
| 6 | `POST /api/ws/session` | `{"action":"INVALID"}` | **400 `INVALID_ACTION`** |
| 7 | `GET /api/ws/stream?channels=all` (curl -N) | — | **200 SSE** bila sesi ON: `SSE_INIT` lalu envelope; `: ping` tiap 15 s |
| 8 | `GET /api/ws/stream` | — | **409 `SESSION_OFF`** bila sesi OFF (EventSource WebView berhenti; AppShell retry manual 3 s) |
| 9 | `GET /api/ws/stream?channels=ward:B` saat env `wardCode:"A"` | — | 200 tapi **tidak** menerima env (filter channel benar) |

> Channel valid: `all`, `ward:<code>`, `delivery:<requestCode>`, `robot:<robotId>` — regex identik dengan `medical-ws/src/core/channels.js`. Koneksi WS backend hanya dibuka BFF saat ada ≥1 subscriber; ditutup saat 0.

Publish envelope uji ke relay (bersama `medical-ws` hidup; set `INTERNAL_PUBLISH_SECRET` dari `medical-ws/.env` — jangan tulis nilai secret di dokumen):

```bash
curl -X POST http://localhost:8081/internal/publish \
  -H "X-Internal-Secret: ${INTERNAL_PUBLISH_SECRET:?export dari medical-ws/.env}" -H 'Content-Type: application/json' \
  -d '{"v":1,"eventId":"evt-1","type":"TELEMETRY","occurredAt":"2026-10-29T10:00:00Z",
       "requestCode":"DELIV-1","wardCode":"A","data":{"robotId":"NEVO-01","battery":78}}'
# → {"accepted":true}; subscriber SSE 'all' menerima envelope identik.
```

## 4. Postman sebagai robot (WS stand-in)

Ada dua jalur WS di `medical-ws` sekarang:

- **Jalur UI** (`{action:"subscribe"}`) — lama, tetap berlaku (bagian 3 di atas).
- **Jalur robot TIFA** (`{code,data}`) — baru, untuk robot fisik; kontrak:
  `docs/api-contracts/robot-ws-tifa.md`.

### 4a. Robot TIFA stand-in (Postman)

Langkah (koleksi `docs/postman-f2.postman_collection.json`, folder **Robot WS stand-in**):

1. Buka request **WS SI — Postman sebagai robot TIFA**, isi variable `wsAuthToken` dari `medical-ws/.env`.
2. **Connect** → terima `{"type":"SNAPSHOT_REQUIRED",...}` (frame jalur UI; abaikan), lalu kirim:
   `{"code":"SI","data":{"type":"ROBOT","robot_id":"NEVO-01"}}` → harap `{"code":"ACK_SOFT","data":{"robot_id":"NEVO-01",...}}`.
3. Kirim uplink: `{"code":"STATUS","data":{"status":"MOVING","mission_code":"DELIV-1"}}`.
   Server meng-enrich `robot_id` + `timestamp` + `message_id`, produce ke Kafka
   `simrs.robot.events.v1` (key `NEVO-01`; no-op saat `KAFKA_ENABLED=false`), dan
   broadcast ke semua sesi UI yang subscribe `robot:NEVO-01` atau `all`.
4. Uji negatif: sambungkan robot kedua dengan SI `robot_id` sama → harap
   `ERROR/DUPLICATE` lalu close **4002**. Uplink tanpa SI dulu → `ERROR/NO_SESSION`.

Self-check otomatis (tanpa Postman): `WS_PORT=8099 npm run check:tifa` di `medical-ws`
(meliputi 4401, ACK_SOFT, duplikat 4002, NO_SESSION, enrich+broadcast+Kafka-stub, re-SI setelah disconnect).

### 4b. UI stand-in (jalur lama, tanpa Kafka)

1. Buka request **WS subscribe robot:NEVO-01**, tekan **Connect**.
2. Kirim `{"action":"subscribe","channels":["robot:NEVO-01"]}` → `SUBSCRIBED`.
3. Dari dashboard `/robots` kirim perintah (cancel / return to dock) → bridge →
   envelope `ROBOT_COMMAND` muncul di tab Message Postman.

> Catatan: downlink TIFA (UI → robot lewat frame `{code,data}`) ditunda fase B;
> kontrak downlink tetap `robot-command.md` (envelope via `/internal/publish`).

## 5. Webhook monitoring → SIMRS (BAGIAN 1 kontrak)

`POST http://localhost:3001/api/v1/monitoring/delivery-status`, header `x-monitoring-token: <isi MONITORING_TOKEN>`, body:

```json
{
  "requestCode": "REQ-…",
  "toStatus": "MOCK_IN_TRANSIT",
  "note": "Departed from dock",
  "compartmentNo": 3,
  "idempotencyKey": "nevomock-deliv-0001-step1"
}
```

- Transisi sah: `PENDING_INTEGRATION → MOCK_IN_TRANSIT → MOCK_ARRIVED_AT_ROOM`; `compartmentNo` **wajib** saat lapor tiba dan hanya disimpan di payload event (bukan kolom tabel); `MOCK_HANDOVER_CONFIRMED` tidak bisa lewat endpoint ini (hanya scan manusia).
- Token salah/hilang → **401** (fail-closed); token digantung dicatat ke audit hanya prefix 4 karakter.
- Kirim ulang `idempotencyKey` yang sama + `requestCode`/`toStatus` sama → balasan hasil pertama, tidak ada event kedua.
- Duplikat bersamaan → unik constraint menangkap; salah satu gagal, bukan dobel.

## 6. Serah-terima (scan QR manusia)

1. Dari SIMRS, buka pasien → **Gelang (QR)** → QR berisi `{base}/scan/{mrn}?t=<token>` — token saja `?t=`, tidak pernah data pasien di query.
2. Buka URL hasil QR (atau scan dengan kamera HP), login `perawat_siti`.
3. Halaman `/scan/{mrn}` menampilkan data pasien `[SINTETIS]` + kompartemen tray (dibaca dari payload event kedatangan) → tombol **Konfirmasi serah-terima** → status `MOCK_ARRIVED_AT_ROOM → MOCK_HANDOVER_CONFIRMED` (jalur QR_SCAN, satu-satunya).
4. Uji negatif: buka `/scan/{mrn}` **tanpa** `t` → "QR Tidak Valid".

## 7. Outbox relay (`npm run relay`, di SIMRS)

- Env kosong (`MONITORING_CALLBACK_URL`/`MONITORING_CALLBACK_TOKEN` kosong di `.env`): log satu baris **pending-honest** dan proses idle — event outbox tetap `PENDING`, tidak ada mutasi DB.
- Env terisi: menyalin event `PENDING` → `POST {MONITORING_CALLBACK_URL}/webhooks/simrs` header `x-simrs-token`; retry backoff 1s/5s/30s/120s, maks 5 attempt → `DEAD`; 4xx (selain 429) langsung `DEAD`. Pengiriman nyata **belum diuji** karena receiver-nya sendiri belum ada; yang siap adalah mekanisme relay-nya.
- **Catatan jujur:** receiver `/webhooks/simrs` & WS penyebar di sisi monitoring (BAGIAN 2 kontrak) **belum dibangun** — polling snapshot tetap kontrak final sampai receiver ada. Kafka (BAGIAN 3) tetap draf; outbox table + relay webhook F2 sudah jadi.

## 8. Hasil checks (2026-10-29, verifikasi ulang)

| Check | Lokasi | Hasil |
|---|---|---|
| `mvn -DskipTests compile` | backend | ✅ exit 0 |
| `tsc --noEmit` | Dashboard | ✅ clean (fix 2026-10-29: kunci `simrs.simrsStatus` + 8 kunci admin hilang di kamus `id`, literal `as const` pada daftar field admin) |
| `next build` | Dashboard | ✅ LULUS (rasio rute normal, `/api/ws/session` & `/api/ws/stream` ter-render dinamis) |
| `tsc --noEmit` | SIMRS | ✅ clean |
| `vitest run` | SIMRS | ✅ **9 files / 50 tests LULUS** |
| `next build` | SIMRS | ✅ LULUS |
| `npm run check` | medical-ws | ✅ channel, envelope, dedupe lolos |
| `POST /missions` ×2 | — | ✅ kedua `QUEUED` + `queuePosition` (lihat §2b), bukan 409 |
| Config `m_setting` | DB | ✅ `V10__settings_table.sql` applied; POST/PATCH persist |

### Riwayat checks sebelumnya (2026-10-27)

| Check | Lokasi | Hasil |
|---|---|---|
| `next lint` | SIMRS | ✅ 0 error; **2 warning pre-existing** (`Select.tsx:41` `required` unused, `auth.ts:5` `ROLE_CODES` unused); `next lint` deprecated Next.js 16 |
| `vitest run` | SIMRS | ✅ 10 files / 56 tests (incl. 4 outbox) — jumlah berubah jadi 9/50 setelah folder `tests/` dipulihkan dari Git |
| `next build` | SIMRS | ✅ LULUS **setelah `rm -rf .next`** (cache korup sebelumnya) |
| Smoke relay | SIMRS | ✅ 3s, log pending-honest, tanpa crash |
| F1 SIMRS ↔ backend | E2E | ✅ 200, deliverable count 8 |
| Migration F2 | DB :5433 | ✅ `h_outbox_event` applied (non-destructive) |
| Sesi WS relay | Smoke | ✅ GET/turnOn/turnOff/lock/unlock/INVALID vs 200/500/400; token hanya prefix `beba••••` |
| SSE relay | Smoke | ✅ `SSE_INIT` + env `TELEMETRY` diteruskan; `ward:B` tidak menerima `wardCode:A`; 409 saat OFF; auto-reconnect (log `[BFF/relay]`) |

### Port saat verifikasi (2026-10-29)

| Port | Pemakai |
|---|---|
| 8080 | kosong (backend belum dijalankan) |
| 8081 | `medical-ws` (`node src/ws/server.js`) — **jangan dijalankan ulang** |
| 3000 / 3001 | kosong |
| 5433 | PostgreSQL Docker (SIMRS) |

Belum diuji (menunggu instruksi): receiver webhook di monitoring, Kafka (trigger belum terpenuhi), HMI.
