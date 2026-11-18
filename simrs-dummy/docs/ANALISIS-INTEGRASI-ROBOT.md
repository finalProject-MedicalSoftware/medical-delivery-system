# Analisis integrasi SIMRS ↔ Web Monitoring ↔ Robot (TFRB5) + panduan uji

Dibuat 2026-11-18. Basis: pembacaan kode `medical-backend`, `medical-ws`, `medical-dashboard-monitoring`, `robot/src/nevo_*`, dan referensi `programTIFA/tifa-web`.

## 1. Apa yang masih mock (sebelum perubahan ini)

| Bagian | Kondisi | Dampak |
|---|---|---|
| Backend `ROBOT_MODE` | Docker default `sim` (compose tidak menyetelnya) → `SimulatedRobotService`: posisi, baterai, perjalanan, "tiba" semuanya simulasi 500 ms. | Web monitoring hanya menampilkan robot `NEVO-01` palsu; `TFRB5` tidak muncul/ tidak dikendalikan. |
| Siklus misi (`POST /missions`, `/missions/manifest`, cancel, antrean) | Hanya ada di mode `sim` (503 "Legacy mission lifecycle hanya tersedia pada ROBOT_MODE=sim"). Mode `real` hanya punya 4 perintah `CMD_*`. | Pengantaran SIMRS tidak bisa menjadi misi untuk robot fisik. |
| Hasil perintah robot | Backend tidak mengonsumsi uplink (ACK/GOAL_COMPLETE); `t_robot_command.result` kosong. | Status misi tidak pernah maju dari uplink robot; SIMRS tidak pernah menerima `ARRIVED_AT_ROOM` dari robot nyata. |
| Gateway `medical-ws` | Downlink ke robot dikunci: hanya "stop nol" (`DEVICE_AUTH_UNAVAILABLE`). `TELEOP` diteruskan sebagai angka. | Robot tidak bergerak. |
| Bentuk frame `TELEOP` | UI/gateway: `data.linear` = angka. Robot (`handleTeleop`) membaca `data.linear.x`, `data.angular.z` (objek Twist). | Walau gate dibuka, robot membaca 0 → tidak jalan. |
| Dashboard `/robots` | `hardwareAuthenticated = false` hard-coded → tombol/WASD selalu mati. | Teleop tidak mungkin dari web. |
| Docker `medical-ws` | Tidak punya `REGISTRY_BACKEND_URL` → SI robot ditolak `REGISTRY_UNAVAILABLE`; port hanya 127.0.0.1 (robot di LAN tak bisa konek). | Robot tidak bisa terdaftar di gateway. |
| Webhook SIMRS di backend | Hanya disimpan (`h_webhook_simrs_event`), tidak dipakai; data masuk lewat polling. | Aman, tapi bukan jalur realtime. |
| SIMRS → backend (polling) | **Nyata** (bukan mock), sudah dirapikan: hanya pengantaran yang dikirim ke robot. | — |

## 2. Yang diubah (branch terpisah; folder rekan ada di `docs/patches/`)

**medical-ws**: `src/core/robot-frames.js` (terjemahan `CMD_*` → frame TIFA: `TELEOP` vektor berskala, `OP`, `MOVE` HOMEBASE, `INTERRUPT(+CONFIRM)`, `PICKUP_CONFIRM`), gate `ALLOW_ROBOT_MOTION` (default `false`), batas `TELEOP_MAX_LINEAR/ANGULAR`, uplink `GOAL_COMPLETE/ACK/ERROR/ROBOT_STUCK/READY` diteruskan ke backend (`src/ws/backend-events.js`), skrip `check:motion` (e2e tanpa Docker) dan `fake-robot`.
**medical-backend**: `RealMissionService` (manifest → satu perintah `OP`; ACK → `EXECUTING` + SIMRS `IN_TRANSIT`; `GOAL_COMPLETE n` → misi ke-n `SUCCEEDED` + SIMRS `ARRIVED_AT_ROOM` + `compartmentNo`; cancel → `CANCELLED`), `RobotEventApi` (`POST /internal/robot-events`, rahasia internal), `MissionPlanningService` mendukung mode real, properti `nevo.robot.home-base`, `mission-timeout-minutes`.
**dashboard**: `/api/ws/command` + `/api/ws/stream` membaca `ALLOW_ROBOT_MOTION`; `/robots` mengaktifkan teleop bila diizinkan.
**compose (simrs-dummy)**: `ROBOT_MODE`, `ALLOW_ROBOT_MOTION`, `REGISTRY_BACKEND_URL`, `MEDICAL_WS_BIND`, batas kecepatan.
**Basis data**: robot `TFRB5` didaftarkan `VERIFIED` di `m_robot` (backend).

## 3. Alur data (tiap panah = kontrak)

```
SIMRS: resep siap → Ajukan pengantaran → [Kirim ke Robot]
   │ (data baru masuk monitoring hanya di sini)
   ▼ GET /monitoring/patients?deliveryReady=true, /patient/{mrn}   (robotEligible, items[], robotReason)
Dashboard /missions/create → POST /missions/manifest → Backend (RealMissionService)
   │ mission SUBMITTED → BACKEND_ACCEPTED ; CMD_DISPATCH_OP (HTTP /internal/publish, rahasia)
   ▼
Gateway medical-ws → frame OP {tray_tasks[{tray,dest{x,y,yaw}}], home_base} → Robot TFRB5
   ▲ ACK(OP,ENQUEUED) / GOAL_COMPLETE{sequence} / POSITION / READY (WS uplink)
   │ → Kafka + dashboard (SSE) ; GOAL_COMPLETE/ACK/ERROR → POST /internal/robot-events (backend)
Backend: EXECUTING + SIMRS POST delivery-status IN_TRANSIT ; GOAL_COMPLETE → SUCCEEDED + ARRIVED_AT_ROOM
Robot menunggu PICKUP_CONFIRM (manusia/HMI) → tray berikutnya atau pulang ke home_base
SIMRS: serah terima HANYA manusia (scan QR) → HANDOVER_CONFIRMED
```

Pemetaan: `GOAL_COMPLETE.sequence` = `t_mission.manifest_sequence` (robot menomori `tray_tasks` dari 1). `tray` = nomor kompartemen.

## 4. Protokol robot yang dipakai (dari `robot_api_node.cpp`)
Downlink: `TELEOP` (`data.linear.{x,y,z}`, `data.angular.{x,y,z}`), `OP`, `MOVE` (`type: HOMEBASE`, `sequence:-1`), `INTERRUPT`, `INTERRUPT_CONFIRM`, `PICKUP_CONFIRM{sequence}`, `MODE`, `MAPPING_*`, `MAP_SELECTED/MAP_DATA`. Uplink: `ACK{command_id,status}`, `ERROR{error_code,error_message}`, `READY`, `POSITION`, `GOAL_COMPLETE{sequence}`, `ROBOT_STUCK`, `EXPRESSION`. Robot mengabaikan frame yang `robot_id`-nya berbeda; `ui_id` (TFUI5) hanyalah label pada uplink.

## 5. Prasyarat uji dengan robot TFRB5
1. **Robot**: `robot_id=TFRB5`, `ui_id=TFUI5`, `ws_uri_primary=ws://<IP Mac>:8083/ws/v1/deliveries` (path wajib; IP Mac saat ini `10.30.1.57`, cek ulang dengan `ipconfig getifaddr en0`). Parameter ada di `nevo_ws_bridge/config/ws_bridge_params.yaml` dan launch `nevo_robot_api` (`ui_id`).
2. **Peta**: peta ROS aktif di backend (`m_mapping_import` kind ROS, active) harus peta yang dipakai robot, dan tiap bed punya waypoint (`m_waypoint`, koordinat frame `map`). Sekarang ada 1 peta + 4 waypoint (data dari simulasi); ganti dengan peta robot (impor peta di dashboard `/maps`) sebelum misi nyata.
3. **Dock**: isi `NEVO_HOME_BASE="x,y,yaw"` bila robot harus pulang otomatis; kosong = berhenti di tempat.

## 6. Cara menjalankan
Tambahkan ke `simrs-dummy/.env` (hapus lagi untuk kembali ke simulasi):
```
ROBOT_MODE=real
ALLOW_ROBOT_MOTION=true
MEDICAL_WS_BIND=0.0.0.0
TELEOP_MAX_LINEAR=0.2
TELEOP_MAX_ANGULAR=0.4
```
Lalu (dari `simrs-dummy/`):
```
SIMRS_WEB_PORT=3001 NEXTAUTH_URL=http://localhost:3001 docker compose --profile apps --profile ws up -d --build
```
**Tanpa robot fisik** (cek rantai penuh): `cd medical-ws && npm install && npm run fake-robot` (ID `TFRB5`; jangan jalan bersamaan dengan robot asli).
**Uji bertahap dengan robot asli**: (1) robot muncul `TFRB5` online di `/robots`; (2) teleop kecepatan rendah dengan robot diangkat/ditopang, tombol stop selalu siap; (3) misi 1 tujuan dekat; (4) manifest 2 tujuan.
Tes otomatis tanpa Docker: `cd medical-ws && npm test && npm run check:motion`; `cd medical-backend && mvn -o test -Dtest=RealMissionServiceTest`.

## 7. Risiko & batas
- Robot SI **tanpa token** dan gate identitas fisik dimatikan oleh `ALLOW_ROBOT_MOTION`: siapa pun di jaringan yang sama dapat mengaku `TFRB5` / menggerakkan robot. Pakai hanya di jaringan uji tepercaya, robot diawasi, e-stop fisik siap. Default tetap terkunci.
- Teleop terus-menerus tergantung koneksi: tidak ada watchdog di gateway (robot berhenti hanya bila menerima frame nol). Pegang tombol stop; tombol di UI mengirim nol saat dilepas.
- `PICKUP_CONFIRM` dan layar tablet (HMI) belum ada; selama itu kirim `CMD_PICKUP_CONFIRM` manual atau gunakan `fake-robot` (auto-pickup).
- Pembatalan: `CMD_CANCEL_MISSION` = `INTERRUPT` + `INTERRUPT_CONFIRM` (robot pulang ke `home_base` jika ada). Misi macet otomatis `UNKNOWN` setelah 60 menit.
- Telemetri (posisi/baterai) mode real dibaca dashboard langsung dari relay gateway, belum disimpan backend.
- Belum teruji dengan robot fisik di sesi ini; yang teruji: unit/e2e gateway (frame dan uplink), unit backend (24 tes).
