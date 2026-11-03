# Kontrak perintah robot (downlink) — backend → medical-ws → robot

> Status: **Kontrak target lintas fase — mock → ROS/Gazebo → robot fisik**.
> Envelope `ROBOT_COMMAND` dan `ROBOT_COMMAND_RESULT` sudah menjadi batas
> integrasi, tetapi adapter ROS/Gazebo dan adapter robot fisik belum terbukti.
> Perubahan isi kontrak = diskusi dan tercatat lebih dulu (AGENTS.md
> aturan 6), bukan diubah diam-diam.

## 1. Arah aliran

```
Dashboard UI (Robot Control)
  --REST /robots/{id}/commands (semua fase)-->  medical-backend
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

- `ROBOT_MODE=sim`: eksekusi in-process oleh `SimulatedRobotService`.
- `ROBOT_MODE=gazebo`: target adapter ROS 2/Gazebo untuk validasi topic,
  frame, safety interlock, dan ACK sebelum hardware.
- `ROBOT_MODE=real`: target adapter robot fisik melalui TIFA/ROS boundary;
  belum siap dipakai sampai adapter, auth, watchdog, dan acceptance hardware
  lulus.
- Semua mode memakai REST facade dan `commandId` yang sama; pergantian mode
  tidak boleh mengubah enum atau bentuk payload. Jalur WS downlink
  didefinisikan sejak awal agar titik tukar tidak perlu dirombak.
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

## 3. Daftar perintah (empat command, semua fase)

Enum tertutup. Menambah jenis perintah = revisi kontrak ini.

| `command` | `params` | Arti |
|---|---|---|
| `CMD_CANCEL_MISSION` | `{ "missionId": "<UUID>" }` wajib | batalkan misi berjalan; hasilnya muncul sebagai event misi `CANCELLED` |
| `CMD_RETURN_TO_DOCK` | `{ "waypointId": "<UUID dock>" }` wajib | kirim robot kembali ke docking; dieksekusi sebagai misi biasa |
| `CMD_SET_SPEED` | `{ "speed": 0..2 }` wajib | ubah batas kecepatan robot dalam m/s; adapter wajib memetakan ke simulator, ROS/Gazebo, atau controller fisik |
| `CMD_TELEOP_DRIVE` | `{ "linear": -1..1, "angular": -2..2 }` wajib | perintah manual; adapter wajib memetakan ke simulator, ROS/Gazebo, atau controller fisik |

`CMD_SET_SPEED` dan `CMD_TELEOP_DRIVE` bukan command simulator-only. Pada
setiap adapter, robot harus `IDLE` untuk teleop, nilai harus berada dalam
batas kontrak, dan safety interlock/watchdog wajib menghentikan gerak saat
koneksi atau heartbeat hilang. Pemetaan topic/interface ROS dan mapping
controller fisik adalah pekerjaan implementasi per fase, bukan perubahan enum.


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
- **Penerusan downlink (aktif sejak 3/11/2026)**: envelope
`ROBOT_COMMAND` yang masuk `POST /internal/publish` diteruskan gateway
sebagai frame TIFA `{code,data}` ke robot terdaftar (SI) dan TIDAK
diforward ke topic `simrs.delivery.events.v1`. Robot tidak dikenal /
offline → uplink sintetis
`ROBOT_COMMAND_RESULT {result:"REJECTED", reason:"UNKNOWN_ROBOT"}` ke
Kafka `simrs.robot.events.v1` + broadcast WS. Endpoint
`GET /internal/robots` (secret sama dengan publish) melaporkan robot
yang terhubung, dipakai backend saat `ROBOT_MODE=real`.
- Robot/adapter dedupe per `commandId` (UUID) — perintah ulang dengan
`commandId` sama diabaikan, bukan dieksekusi dua kali.
- Perintah untuk robot yang sedang sibuk: `REJECTED`/`ROBOT_BUSY`
  (satu robot, satu misi aktif — konsisten perilaku simulator).
- Pada simulator, retry/konfirmasi transport belum dimodelkan.
- Pada ROS/Gazebo dan hardware, adapter wajib memiliki ACK/timeout,
  idempotensi `commandId`, watchdog teleop, dan hasil gagal yang dapat
  ditelusuri; tidak boleh menganggap HTTP `202` sebagai robot sudah bergerak.

## 6. REST fasad (path dikunci lintas fase)

| Method | Path | Isi |
|---|---|---|
| `GET /robots` | daftar robot dari tabel robot (bukan objek simulator tunggal), minimal: `robotId`, `name`, `status`, `activeMissionId` (nullable) |
| `POST /robots/{robotId}/commands` | body `{ "command": "…", "params": {…} }`; backend membuat `commandId`+`eventId`, menjawab `202 { "commandId": "…" }`; validasi enum di backend, bukan di UI |

Autentikasi REST = session cookie + CSRF (cookie `XSRF-TOKEN` dikirim
balik lewat header `X-XSRF-TOKEN`) via BFF `/api/proxy/` dashboard —
aturan 5 (token lewat header, bukan query param/URL) dan aturan 4
(tanpa hardcode). Sisi server wajib login: `SecurityConfiguration`
melindungi `/api/v1/**`; hanya `/auth/**`, `/actuator/health`, `/error`
yang permitAll, sisanya denyAll. Pemilihan adapter dikendalikan env
(`ROBOT_MODE=sim|gazebo|real`, default `sim`). `real` aktif sejak
3/11/2026 lewat `RealRobotAdapter` (validasi param sama dengan
simulator + publish `ROBOT_COMMAND` ke gateway; hasil datang asinkron
lewat uplink robot — kolom `result` di `t_robot_command` mengisi sendiri
hanya untuk hasil sintetis gateway). `gazebo` belum terbukti siap dan
membutuhkan gate keselamatan serta acceptance terpisah sebelum perintah
diteruskan ke robot bergerak.

## 7. Registrasi robot node

Registrasi robot baru ke tabel `m_robot` — prasyarat agar robot bisa
menerima perintah §3 dan tampil pada `GET /robots` (§6). Endpoint ini
berdiri di samping §6; keduanya bagian dari fasad REST perintah.

| Method | Path | Isi |
|---|---|---|
| `GET /robots/registry` | daftar robot terdaftar, memetakan `m_robot` → camelCase: `robotId`, `name`, `model`, `registeredAt` (string; `null` bila kolom kosong) |
| `POST /robots` | body `{ "robotId": "…", "name": "…", "model": "…" }`; backend memvalidasi, cek duplikat, insert `m_robot`, menulis audit; menjawab `201 { "robotId", "name", "model" }` |

Aturan:

- **Validasi `POST`**: `robotId` 3–64 karakter `[A-Za-z0-9_.-]`; `name`
  1–150 karakter; `model` opsional, maksimal 100 karakter. Pelanggaran
  → `400` (pesan validasi, tanpa menulis DB).
- **Body error**: respons `4xx` memakai bentuk default Spring
  `{timestamp, status, error, message, path}`; field `message`
  membawa alasan spesifik (mis. `409` → `"robotId sudah terdaftar"`).
  `message` tersedia sejak `server.error.include-message: always` di
  `application.yml` (tercatat 1/11/2026); sebelumnya Spring Boot 3
  memotong field ini sehingga klien hanya melihat `error: Conflict`.
  Sejak 2/11/2026 setiap body error disaring `ApiErrorSanitizer`
  (`@Component` yang meng-override `ErrorAttributes` bawaan): hanya
  pesan bisnis kurasi yang lolos apa adanya (whitelist exact, prefix
  aman untuk pesan dinamis seperti `"Misi tidak ditemukan: <id>"` /
  `"SIMRS mengembalikan HTTP <n> setelah <k> percobaan"`, suffix
  `"<field> wajib angka"`, dan gate berantai `Failed to parse PGM: …`
  yang hanya menerima pesan konverter PGM); pesan internal Spring/JDK
  (`Access Denied`, `For input string: …`, `Failed to convert value of
  type …`, `Validation failed …`, `No static resource …`, CSRF/exception
  mentah) dan semua `5xx` jatuh ke fallback generik
  `"Permintaan gagal (HTTP <status>)"` (termasuk pesan kosong).
  Daftar whitelist ada di `ApiErrorSanitizer.java`; menambah error baru
  = menambah whitelist + kasus di `ApiErrorSanitizerTest`, dan dianggap
  perubahan kontrak yang tercatat di dokumen ini.
- **Duplikat**: `robotId` sudah ada → `409`, tanpa insert dan tanpa audit.
- **`model` kosong** → insert tanpa kolom `model`; nilai default DB
  (`NEVO-A1`) berlaku, dan respons menampilkan nilai hasil baca DB agar
  klien tidak menebak default.
- **Akses**: `GET /robots/registry` dan `POST /robots` di atas catch-all
  `SecurityConfiguration`; `POST /robots` hanya
  `hasRole("ADMIN")` — matcher exact path
  `HttpMethod.POST /api/v1/robots` dipasang **sebelum** catch-all
  dibaca, sehingga `POST /robots/{robotId}/commands` (§6) tidak ikut
  terkena, dan `GET /robots` komposit (§6) tidak berubah. Non-ADMIN →
  `403`.
- **Audit**: setiap registrasi sukses menulis
  `h_mapping_audit(actor, operation, mapping_id NULL)` dengan
  `operation = ROBOT_REGISTER` (konvensi tabel audit bersama; `actor`
  = username dasar).
- Registrasi tidak menyentuh taksonomi status `monitoring-events.md`;
  robot terdaftar bertahan dengan status awal tabel (`m_robot`).
- Serah-terima tetap hanya manusia — registrasi robot tidak memicu
  transisi `ARRIVED→HANDOVER` otomatis (AGENTS.md aturan 3).
