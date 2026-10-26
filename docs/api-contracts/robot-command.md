# Kontrak perintah robot (downlink) — backend → medical-ws → robot

> Status: **FINAL untuk fase mock**. Menambah tipe `ROBOT_COMMAND` dan
> `ROBOT_COMMAND_RESULT` pada envelope `internal-publish-bridge.md`.
> Perubahan isi kontrak = diskusi dan tercatat lebih dulu (AGENTS.md
> aturan 6), bukan diubah diam-diam.

## 1. Arah aliran

```
Dashboard UI (Robot Control)
  --REST /robots/{id}/commands (fase B)-->  medical-backend
                                              |
                        ROBOT_MODE=sim  ------+------>  RobotAdapter (eksekusi in-process)
                        ROBOT_MODE=real ------------->  POST /internal/publish
                                                        (type ROBOT_COMMAND, X-Internal-Secret)
                                                             |
                                                             v
                                                     medical-ws, kanal robot:<robotId>
                                                             |
                                                             v
                                                     klien robot (HMI/robot sungguhan, WS)
```

- Fase mock: `ROBOT_MODE=sim`, perintah dieksekusi langsung oleh
  `RobotAdapter` (implementasi: `SimulatedRobotService`) — jalur WS
  downlink tetap didefinisikan sekarang agar fase robot sungguhan tanpa
  rework titik tukar (pola sama dengan `internal-publish-bridge.md`).
- Eksekusi perintah TIDAK mengubah taksonomi status `monitoring-events.md`
  (tetap `EXECUTING/SUCCEEDED/FAILED/CANCELLED` — tidak ada status baru).
- Serah-terima tetap hanya manusia; tidak ada perintah yang memicu
  transisi otomatis `ARRIVED→HANDOVER` (AGENTS.md aturan 3).

## 2. Envelope perintah

Bentuk identik dengan envelope `internal-publish-bridge.md`, tipe baru:

```json
{
  "v": 1,
  "eventId": "8c2e1f0a-6f5d-4e2b-9a10-77c1d3b42e6f",
  "type": "ROBOT_COMMAND",
  "occurredAt": "2026-10-27T03:20:00.000Z",
  "requestCode": "",
  "wardCode": "",
  "data": {
    "commandId": "d4b1a9c0-3e7f-4c58-b2d6-01a9f5c8e7d2",
    "robotId": "ROBOT-01",
    "command": "CMD_CANCEL_MISSION",
    "issuedBy": "perawat.budi",
    "params": { "missionId": "3f2c8a10-9b4e-4d1a-8c30-6e5b7f0a1d23" }
  }
}
```

Perbedaan aturan field untuk tipe `ROBOT_COMMAND` (di luar tabel lama):

| Field | Aturan |
|---|---|
| `type` | `ROBOT_COMMAND` |
| `requestCode` | string, boleh kosong (perintah tanpa misi tidak memilikinya) |
| `wardCode` | string, boleh kosong (idem) |
| `data.commandId` | UUID wajib; kunci dedupe di sisi robot |
| `data.robotId` | wajib; kunci kanal downlink `robot:<robotId>` |
| `data.command` | wajib; salah satu dari daftar §3 (enum tertutup) |
| `data.issuedBy` | wajib; username dasbor yang menerbitkan |
| `data.params` | object non-null; isi per jenis perintah di §3 |

## 3. Daftar perintah (fase ini)

Enum tertutup. Menambah jenis perintah = revisi kontrak ini.

| `command` | `params` | Arti |
|---|---|---|
| `CMD_CANCEL_MISSION` | `{ "missionId": "<UUID>" }` wajib | batalkan misi berjalan; hasilnya muncul sebagai event misi `CANCELLED` |
| `CMD_RETURN_TO_DOCK` | `{ "waypointId": "<UUID dock>" }` wajib | kirim robot kembali ke docking; dieksekusi sebagai misi biasa |

Tidak ada perintah navigasi bebas atau teleop di fase ini — belum ada
robot sungguhan; keduanya masuk revisi kontrak bersama fase robot.

## 4. Hasil eksekusi

Perintah asinkron. Backend menjawab REST dengan `202` segera; hasil
eksekusi dikonsumsi lewat satu tipe uplink tambahan:

```json
{
  "v": 1,
  "eventId": "…",
  "type": "ROBOT_COMMAND_RESULT",
  "occurredAt": "…",
  "requestCode": "",
  "wardCode": "",
  "data": {
    "commandId": "d4b1a9c0-…",
    "robotId": "ROBOT-01",
    "result": "OK",
    "reason": ""
  }
}
```

| `result` | Kondisi |
|---|---|
| `OK` | perintah diterima dan dieksekusi mulai |
| `REJECTED` | ditolak; `reason` salah satu: `ROBOT_BUSY`, `UNKNOWN_ROBOT`, `INVALID_PARAMS`, `MODE_NOT_SUPPORTED` |

Pada `ROBOT_MODE=sim`, `RobotAdapter` mengisi `ROBOT_COMMAND_RESULT`
langsung (tidak melewati klien robot). Pada `ROBOT_MODE=real`, klien
robot mengirim tipe ini lewat jalur uplink yang sama seperti
`MISSION_EVENT`/`TELEMETRY`. `request_code`/`wardCode` dipertahankan
polanya: string, boleh kosong, supaya event hasil tidak dianggap misi.

## 5. Dedupe & kegagalan

- medical-ws tetap dedupe per `eventId`; tanpa perubahan di sana selain
mengizinkan tipe baru lolos validasi dan menyediakan kanal
`robot:<robotId>`.
- Robot/adapter dedupe per `commandId` (UUID) — perintah ulang dengan
`commandId` sama diabaikan, bukan dieksekusi dua kali.
- Perintah untuk robot yang sedang sibuk: `REJECTED`/`ROBOT_BUSY`
  (satu robot, satu misi aktif — konsisten perilaku simulator).
- Tidak ada mekanisme retry/konfirmasi katup di fase mock ([MOCK] penuh).

## 6. REST fasad (diimplementasikan fase B, path dikunci di sini)

| Method | Path | Isi |
|---|---|---|
| `GET /robots` | daftar robot dari tabel robot (bukan objek simulator tunggal), minimal: `robotId`, `name`, `status`, `currentMissionId` (nullable) |
| `POST /robots/{robotId}/commands` | body `{ "command": "…", "params": {…} }`; backend membuat `commandId`+`eventId`, menjawab `202 { "commandId": "…" }`; validasi enum di backend, bukan di UI |

Fase ini: REST backend belum ber-token sama sekali (kondisi nyata
MissionApi hari ini) — perintah dianggap `[MOCK]` sebagaimana seluruh
REST mock. Bila token diberlakukan nanti, ia lewat **header** (bukan
query param/URL — AGENTS.md aturan 5) dan kontrak ini direvisi, bukan
diam-diam. Tidak ada port/URL/token hardcode — semua via env (AGENTS.md
aturan 4). Penjelasan `ROBOT_MODE` dan pemilihan adapter adalah
pekerjaan fase B; fase ini hanya mengunci bentuk kontraknya.
