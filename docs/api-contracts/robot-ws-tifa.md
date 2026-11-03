# Kontrak WS robot TIFA — robot fisik ↔ medical-ws

> Status: **Kontrak target TIFA lintas fase**. Menambah jalur protokol TIFA
> pada `medical-ws` di samping jalur UI envelope yang sudah ada
> (`hmi.md`, `robot-command.md`, `web-monitoring-integration.md`). Implementasi
> gateway saat ini baru membuktikan uplink/stand-in; kesiapan downlink untuk
> ROS/Gazebo dan robot fisik masih menjadi gate implementasi.
> Perubahan isi kontrak = diskusi dan tercatat lebih dulu (AGENTS.md
> aturan 6), bukan diubah diam-diam.

## 1. Sumber protokol

Frame `{code, data}` **verbatim** dari TIFA (`tifa-ws`). Robot fisik
(NEVO) tidak perlu tahu sistem medis — dia bicara protokol TIFA standar.

## 2. Koneksi

- Endpoint sama dengan UI: `ws://<host>:<WS_PORT><WS_PATH>`
- Auth handshake sama: header `Authorization: Bearer $WS_AUTH_TOKEN`;
  gagal → close `4401`.
- Frame pertama dari server tetap `{"type":"SNAPSHOT_REQUIRED",...}`
  (jalur UI); robot mengabaikan frame non-`{code,data}`.

## 3. Handshake (SI)

Robot → server:

```json
{ "code": "SI", "data": { "type": "ROBOT", "robot_id": "nevo-01" } }
```

Server → robot:

```json
{ "code": "ACK_SOFT", "data": { "robot_id": "nevo-01", "timestamp": "..." } }
```

- `robot_id` tidak string/ kosong → `ERROR/INVALID_SI` + close **4003**.
- `robot_id` sudah punya sesi aktif → `ERROR/DUPLICATE` + close **4002**.
  (Sesi lama mati/heartbeat timeout otomatis melepas `robot_id`.)

## 4. Uplink (robot → server)

Setelah SI, setiap frame `{code, data}` dianggap uplink. Server:

1. **Enrich** (tidak mengubah bentuk frame):
   `data.robot_id` (dari identitas sesi) + `data.timestamp` (ISO server) +
   top-level `message_id` (UUID bila tidak ada).
2. **Kafka**: produce ke `simrs.robot.events.v1`, key = `robot_id`
   (at-least-once; order per robot dijamin via key). Tidak ada silent drop
   — Kafka off (bridge HTTP mode) berarti hanya broadcast WS.
3. **Broadcast WS**: frame yang sama dikirim ke semua sesi UI (jalur
   `subscribe`) yang match channel `robot:<robot_id>` atau `all`.

Kode uplink umum (non-eksklusif; kode tak dikenal tetap dialirkan):
`STATUS`, `ACK`, `POSITION`, `BATTERY`, `GOAL_COMPLETE`,
`MAPPING_COMPLETE`, `ROBOT_STUCK`.

Frame tanpa SI dulu → `ERROR/NO_SESSION` (socket tetap terbuka).

## 5. Downlink (UI → robot)

Target downlink adalah empat command pada `robot-command.md` melalui
`ROBOT_COMMAND`/`ROBOT_COMMAND_RESULT`. Downlink berjalan lewat jalur yang
sama dengan uplink: backend mem-publish envelope `ROBOT_COMMAND` ke
`POST /internal/publish`; gateway meneruskan frame TIFA
`{code:"ROBOT_COMMAND", data:{commandId, robotId, command, issuedBy, params}}`
ke socket robot terdaftar (`SI`), **tanpa** meneruskan envelope ini ke
topic `simrs.delivery.events.v1` (perintah bukan event delivery). Robot
yang tidak dikenal / offline menghasilkan uplink sintetis
`ROBOT_COMMAND_RESULT {result:"REJECTED", reason:"UNKNOWN_ROBOT"}`
(ke Kafka `simrs.robot.events.v1` + broadcast WS) sehingga dedupe
`commandId` per §5 `robot-command.md` tetap bekerja di kedua arah.

Status implementasi 3/11/2026: jalur ini **aktif** dan diuji
(`medical-ws/e2e.mjs` + `scripts/tifa-selfcheck.js`). Endpoint
`GET /internal/robots` (header `X-Internal-Secret`, sama seperti
`/internal/publish`) melaporkan daftar robot yang terhubung SI.
Keputusan gate "real" pada §6 dibuka terpisah dengan keputusan tertulis.

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
