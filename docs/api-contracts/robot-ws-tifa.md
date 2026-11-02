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
`ROBOT_COMMAND`/`ROBOT_COMMAND_RESULT`. Gateway saat ini baru menerima
uplink; penerusan downlink TIFA belum terimplementasi dan karena itu belum
boleh diklaim siap untuk ROS/Gazebo atau hardware. Gate sebelum perintah
bergerak: mapping command → interface ROS/controller, auth, ACK/timeout,
dedupe `commandId`, watchdog teleop, dan uji disconnect/reconnect.

## 6. Fase dan batas klaim

- `sim`: stand-in/simulator boleh dipakai untuk validasi envelope dan UI.
- `gazebo`: wajib membuktikan topic, TF, ACK, watchdog, dan perilaku empat
  command tanpa hardware.
- `real`: wajib ada owner robot, kredensial produksi terpisah, safety operator,
  emergency stop, rollback/disconnect procedure, dan acceptance tertulis.

## 7. Label data sintetis

Telemetri dari robot simulasi/ stand-in tetap mengikuti AGENTS.md aturan 1:
label `[MOCK]`/`SIMULATED` diproduksi sumber data (backend/robot sim),
bukan ditulis manual di gateway. Gateway tidak memodifikasi isi `data`
selain field enrichment di §4.
