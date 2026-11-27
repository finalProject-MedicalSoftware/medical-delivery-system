# Kontrak WS robot TIFA — robot fisik ↔ medical-ws

> Status: **Kontrak target TIFA lintas fase — direvisi 4/11/2026** (tercatat,
> sesi replikasi protokol WS TIFA, diskusi dengan owner). Revisi: (1) auth
> pindah ke dalam SI (§2–3), (2) duplicate error memakai string persis
> `DUPLICATE_ROBOT_ID`/`DUPLICATE_UI_ID`, (3) downlink dua jalur: relay
> verbatim UI SI→robot (whitelist kode) + envelope `ROBOT_COMMAND` backend
> (§5), (4) roster sesi `/internal/robots`. Implementasi gateway & BFF
> dashboard untuk semuanya sudah aktif dan lulus selfcheck. Perubahan isi
> kontrak = diskusi dan tercatat lebih dulu (AGENTS.md aturan 6), bukan
> diubah diam-diam.

## 1. Sumber protokol

Frame `{code, data}` **verbatim** dari TIFA (`tifa-ws`). Robot fisik
(NEVO) tidak perlu tahu sistem medis — dia bicara protokol TIFA standar.

## 2. Koneksi dan auth

- Endpoint sama dengan UI: `ws://<host>:<WS_PORT><WS_PATH>`.
- Upgrade HTTP boleh anonim; auth asli dilakukan di dalam frame SI (§3),
  berdasarkan `type` identitas:
  - `type: ROBOT` — tanpa token, tidak boleh mendaftar UI.
  - `type: UI` — wajib membawa `token` yang dicek terhadap env
    `WS_AUTH_TOKEN`; jika env kosong → semua SI UI ditolak (fail-closed).
- Header `Authorization: Bearer $WS_AUTH_TOKEN` pada upgrade tetap
  divalidasi **bila dibawa**; gagal → close `4401` (jalur UI lama).
  Tanpa bearer, klien harus SI supaya dapat frame apa pun.
- Frame pertama dari server untuk jalur legacy tetap
  `{"type":"SNAPSHOT_REQUIRED",...}`; klien TIFA mengabaikan frame
  non-`{code,data}`. Jalur `action:"subscribe"` legacy wajib membawa
  bearer ATAU sudah berupa sesi SI-UI, selain itu ditolak.

## 3. Handshake (SI)

Robot → server:

```json
{ "code": "SI", "data": { "type": "ROBOT", "robot_id": "nevo-01" } }
```

Server → robot:

```json
{ "code": "ACK_SOFT", "data": { "robot_id": "nevo-01", "timestamp": "..." } }
```

UI → server (token wajib; identitas UI dipakai untuk downlink dan roster):

```json
{ "code": "SI", "data": { "type": "UI", "ui_id": "monitoring-dashboard", "token": "..." } }
{ "code": "ACK_SOFT", "data": { "ui_id": "monitoring-dashboard", "timestamp": "..." } }
```

Error (socket tetap terbuka kecuali dinyatakan lain):

| Kondisi | Respons |
|---|---|
| `robot_id` bukan string/kosong, payload SI tak valid | `ERROR/INVALID_SI` + close **4003** |
| `robot_id` sudah punya sesi aktif yang hidup | `ERROR/DUPLICATE_ROBOT_ID` (socket baru tetap terbuka; kick hanya bila socket lama sudah DEAD) |
| `ui_id` sudah punya sesi aktif yang hidup | `ERROR/DUPLICATE_UI_ID` (idem) |
| token UI salah / env kosong | `ERROR/UNAUTHORIZED` |
| frame `code` bukan string | `ERROR/INVALID_MESSAGE` |

- `ROBOT` tidak boleh registernya sebagai UI dan sebaliknya (mismatch
  `type` dianggap `INVALID_SI`).

## 3a. Pairing perangkat UI (tablet HMI) — disetujui owner 26/11/2026, diimplementasi di `medical-ws` (uji: `npm run check:pairing`)

> Alasan: token bersama `WS_AUTH_TOKEN` panjang, diketik manual di tiap
> tablet, hilang saat tablet restart, dan satu kebocoran mengenai semua
> klien. Pairing memberi tiap tablet **token perangkat** sendiri yang bisa
> dicabut satu per satu. Jalur token bersama tetap berlaku untuk
> dashboard/BFF (tidak berubah). Acuan perilaku sesi: `reference-app/nevo-app`
> (`WebSocketService.js`), tidak disalin.

### Kode pairing (admin)

- Dibuat lewat `npm run pair -- <ui_id>` di `medical-ws`, atau
  `POST /internal/pairing` dengan header `x-internal-secret`
  (`INTERNAL_PUBLISH_SECRET`, dipakai BFF dashboard). Body `{ "ui_id": "TFUI5" }`.
  Respons: `{ "ui_id", "code", "expires_at" }`.
- `code` berisi 6 digit acak (crypto) dan hanya berlaku sekali.
  Berlaku selama `PAIRING_TTL_SEC` (bawaan 600 detik), lalu gugur.
  Kode juga gugur setelah 5 kali percobaan salah.
  Satu `ui_id` hanya punya satu kode aktif; membuat kode baru membatalkan kode lama.
- Kode hanya disimpan di memori gateway (hilang saat restart gateway) dan
  tidak pernah ditulis ke log.
- Kode juga bisa dipakai sebagai QR untuk dipindai tablet. Isi QR:
  `{"ws":"<url>","ui_id":"TFUI5","code":"123456"}`.

### Tablet → gateway (sebelum SI)

```json
{ "code": "PAIR", "data": { "ui_id": "TFUI5", "code": "123456", "instance_id": "<uuid tetap per instalasi>" } }
{ "code": "PAIR_OK", "data": { "ui_id": "TFUI5", "device_token": "<43 karakter base64url>", "paired_at": "..." } }
```

- `device_token` berisi 32 byte acak. Gateway hanya menyimpan
  `sha256(device_token)` bersama `ui_id`, `instance_id`, `paired_at`,
  dan `last_seen` di `DEVICES_FILE` (bawaan `data/devices.json`, volume Docker).
- Satu `ui_id` dipasangkan ke **satu** perangkat. Pairing baru mencabut
  perangkat lama untuk `ui_id` itu. Bila perangkat lama (instance lain) sedang
  tersambung, sesinya ditutup close **4002** `DEVICE_REVOKED`.
- Salah, kedaluwarsa, atau sudah terpakai → `ERROR/PAIR_INVALID`. Pesan sengaja
  sama untuk ketiganya agar tidak membocorkan alasan. Socket tetap terbuka.
  Batas: 5 `PAIR` per socket per menit.

### SI UI dengan token perangkat

```json
{ "code": "SI", "data": { "type": "UI", "ui_id": "TFUI5", "instance_id": "<uuid>", "device_token": "..." } }
{ "code": "ACK_SOFT", "data": { "ui_id": "TFUI5", "auth": "device", "timestamp": "..." } }
```

- `device_token` harus cocok dengan `ui_id` **dan** `instance_id`. Kalau tidak cocok →
  `ERROR/DEVICE_UNPAIRED` (tablet menampilkan "Pasangkan ulang").
- SI dengan `token` (token bersama) tetap diterima seperti §3 dan dibalas dengan `auth: "shared"`.

### Sesi ganda (perubahan aturan duplikat UI)

| Kondisi saat `ui_id` sudah punya sesi hidup | Respons |
|---|---|
| `instance_id` sama (tablet yang sama tersambung ulang; sesi lama = "hantu") | Sesi lama ditutup dengan close **4001** `SESSION_REPLACED`, sesi baru diterima |
| `instance_id` beda | `ERROR/DUPLICATE_UI_ID` (seperti sekarang) |
| `instance_id` beda + `force: true` + auth sah | Sesi lama ditutup dengan **4001**, sesi baru diterima. Hanya dari tombol manual "Ambil alih sesi" di tablet |

Klien yang menerima close **4001** **tidak boleh** reconnect otomatis,
supaya dua perangkat tidak saling menendang. Aturan duplikat ROBOT tidak berubah.

### Mencabut perangkat

- Dari tablet (sesi SI-UI dengan `auth: device`): `{ "code": "UNPAIR", "data": {} }` →
  `UNPAIR_OK`. Token dihapus dari `DEVICES_FILE`, lalu socket ditutup dengan close 1000.
- Dari admin: `npm run pair -- --revoke <ui_id>` atau
  `DELETE /internal/pairing/<ui_id>` (header `x-internal-secret`).
  Sesi hidup milik perangkat itu ikut ditutup dengan close **4002** `DEVICE_REVOKED`.

### Log

Token perangkat dicatat maksimal 4 karakter awal (aturan 7). Kode pairing
tidak pernah dicatat; yang dicatat hanya "kode dibuat untuk TFUI5, berlaku s.d. …".

## 4. Uplink (robot → server)

Setelah SI, setiap frame `{code, data}` dianggap uplink. Server:

1. **Enrich** (tidak mengubah bentuk frame):
   `data.robot_id` (dari identitas sesi) + `data.timestamp` (ISO server) +
   top-level `message_id` (UUID bila tidak ada).
2. **Kafka**: produce ke `simrs.robot.events.v1`, key = `robot_id`
   (at-least-once; order per robot dijamin via key). Tidak ada silent drop
   — Kafka off (bridge HTTP mode) berarti hanya broadcast WS.
3. **Broadcast WS**: frame yang sama (sudah di-enrich) dikirim verbatim
   ke semua sesi UI — baik sesi SI-UI maupun jalur `subscribe` legacy —
   yang match channel `robot:<robot_id>` atau `all`. Gateway juga
   menyimpan `lastCode/lastSeen/status/position/battery` per robot
   (roster) dan mengumumkan join/leave sesi robot.

Kode uplink umum (non-eksklusif; kode tak dikenal tetap dialirkan):
`STATUS`, `ACK`, `READY`, `ERROR`, `POSITION`, `BATTERY`, `GOAL_COMPLETE`,
`MAPPING_STATUS`, `MAPPING_COMPLETE`, `ROBOT_STUCK`,
`EMERGENCY_STOP` (26/11, disetujui: robot berhenti darurat. HMI wajib menghentikan
presentasi dan menampilkan layar henti; data mengikuti kiriman robot,
minimal `robot_id`).

Frame tanpa SI dulu → `ERROR/NO_SESSION` (socket tetap terbuka).

## 5. Downlink (UI → robot) — dua jalur

### 5a. Relay verbatim sesi SI-UI (baru, aktif)

UI yang sudah SI (`type: UI`) boleh mengirim `{code, data}` downlink
langsung tanpa pembungkus envelope. Gateway relay **verbatim** — frame
diteruskan apa adanya ke robot, tanpa konversi `commandId` dsb.

Aturan gateway `medical-ws`:

- Hanya sesi SI-UI boleh downlink; lainnya → `ERROR/UI_SESSION_REQUIRED`.
- Whitelist kode (`DOWNLINK_CODES`): `TELEOP`, `MOVE`, `OP`, `MODE`,
  `MAPPING_START`, `MAPPING_STOP`, `MAPPING_SAVE`, `MAPPING_FLAG`,
  `MAP_SELECTED`, `MAP_DATA`, `INTERRUPT`, `INTERRUPT_CONFIRM`,
  `INTERRUPT_CANCEL`, `PICKUP_CONFIRM` — di luar itu
  `ERROR/CODE_NOT_ALLOWED`.
- Target: `data.robot_id` (string, di-inject ulang oleh gateway sebelum
  diteruskan) atau top-level `{action:"robot", id}`; absen → broadcast ke
  semua robot. Robot target offline → `ERROR/ROBOT_OFFLINE` (berisi
  `robot_id`) ke UI pengirim.
- Kode uplink yang dikirim UI (mis. `READY`) dialirkan pula sebagai
  enrichment — tidak diblokir, hanya tidak masuk whitelist downlink.

Sisi dashboard monitoring: dikendalikan lewat BFF (bukan WS langsung dari
browser) — `POST /api/ws/command {code, data}` pada
`medical-dashboard-monitoring/frontend` memvalidasi whitelist yang sama,
`MAP_ID_MUST_BE_INTEGER` untuk `data.map_id`, `RELAY_NOT_CONNECTED` (503)
bila relay belum SI ke gateway, lalu meneruskan frame ke relay. Teleop
halaman `/robots` (tombol hold + WASD) mengirim `{code:"TELEOP",
data:{linear,angular,robot_id}}` pada 10 Hz dengan stop `{linear:0,
angular:0}` saat tombol/key dilepas. Kontrol mapping memakai
`MAPPING_START/STOP/SAVE/FLAG` + `MAP_SELECTED {map_id}`.

#### ACK `MAPPING_FLAG` membawa pose (keputusan kontrak — 5/11/2026)

Robot menjawab `MAPPING_FLAG` dengan ACK uplink `{code:"MAPPING_FLAG",
data:{...}}` yang kini **memuat koordinat pose saat flag**: `data.x`,
`data.y`, `data.yaw` (numerik). UI `tifa-web` membaca ACK ini lalu insert
`m_goal` lokal (`goal_type='CUSTOM'`) pada `m_device.active_map_id` milik
`data.robot_id`. Gate: hanya insert bila `data.x` & `data.y` hadir — echo
flag dari UI tidak punya pose sehingga tidak di-insert. Tanpa pose robot,
tidak ada goal koordinat live; jalur prod yang sudah terbukti tetaplah
`POST /api/maps/upload/full` → `saveMapMetadata` (`m_goal` CUSTOM).

### 5b. Envelope ROBOT_COMMAND dari backend (kontrak robot-command.md)

Downlink berjalan lewat jalur yang
sama dengan uplink: backend mem-publish envelope `ROBOT_COMMAND` ke
`POST /internal/publish`; gateway meneruskan frame TIFA
`{code:<command>, data:{...params, robot_id, command_id}}`
ke socket robot terdaftar (`SI`), **tanpa** meneruskan envelope ini ke
topic `simrs.delivery.events.v1` (perintah bukan event delivery). Robot
yang tidak dikenal / offline menghasilkan uplink sintetis
`ROBOT_COMMAND_RESULT {result:"REJECTED", reason:"UNKNOWN_ROBOT"}`
(ke Kafka `simrs.robot.events.v1` + broadcast WS) sehingga dedupe
`commandId` per §5 `robot-command.md` tetap bekerja di kedua arah.

Status implementasi 4/11/2026: jalur 5a dan 5b **aktif** dan diuji
(`medical-ws/e2e.mjs` + `scripts/tifa-selfcheck.js`, 20 asersi).
Endpoint `GET /internal/robots` (header `X-Internal-Secret`, sama seperti
`/internal/publish`) melaporkan daftar robot yang terhubung SI.
Keputusan gate "real" pada §6 dibuka terpisah dengan keputusan tertulis
(setuju 3/11/2026).

## 6. Fase dan batas klaim

- `sim`: stand-in/simulator boleh dipakai untuk validasi envelope dan UI.
- `gazebo`: wajib membuktikan topic, TF, ACK, watchdog, dan perilaku empat
  command tanpa hardware.
- `real`: **keputusan 3/11/2026 (owner)** — setuju lingkungan real robot
  dibuka untuk integrasi downlink: backend memakai `RealRobotAdapter`
  (`ROBOT_MODE=real`) menggunakan gateway di atas, robot fisik/klien ROS
  menyambung lewat WS dari sisi klien (teleop WASD `±1`, speed `0..2`,
  cancel misi tetap kontrak). Ketentuan yang tetap berlaku sebelum uji
  gerak: robot harus memiliki owner di ruangan, operator di dekat robot
  saat perintah bergerak, dan prosedur stop (cancel + matikan klien robot)
  sudah diketahui — dicatat di dokumen, bukan penghalang kode. Uji
  disconnect/reconnect + watchdog tercakup di checklist owner
  (README prosedur uji robot).

## 7. Label data sintetis

Telemetri dari robot simulasi/ stand-in tetap mengikuti AGENTS.md aturan 1:
label `[MOCK]`/`SIMULATED` diproduksi sumber data (backend/robot sim),
bukan ditulis manual di gateway. Gateway tidak memodifikasi isi `data`
selain field enrichment di §4.
