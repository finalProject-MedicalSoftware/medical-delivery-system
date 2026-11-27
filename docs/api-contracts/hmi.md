# Kontrak HMI robot (medical-hmi ↔ backend + medical-ws)

> Status: **FINAL untuk fase mock**. HMI belum dibangun (fase 4); dokumen
> ini menetapkan apa yang **boleh** dan **wajib** dipakai HMI saat
> dibangun. Perubahan isi kontrak = diskusi dan tercatat lebih dulu
> (AGENTS.md aturan 6), bukan diubah diam-diam.

## 1. Peran HMI

HMI adalah layar di badan robot (React Native, pola `tifa-app`). Tugasnya
hanya tiga:

1. menampilkan wajah robot yang mencerminkan status misi;
2. memandu serah-terima: tampilkan **nomor kompartemen lebih dulu**, baru
   nama obat + aturan pakai + suara;
3. menerima perintah operator (batal misi, ulangi panduan).

HMI **bukan** sumber kebenaran. Semua status berasal dari backend
(`t_mission.status`) atau dari event `medical-ws`. HMI tidak menulis
status misi sendiri; satu-satunya tulisan HMI adalah
`POST /integrations/simrs/delivery-status` **tidak** — itu milik sistem
SIMRS/operator, bukan HMI. HMI tidak melakukan transisi `ARRIVED` →
`HANDOVER` (AGENTS.md aturan 3: serah-terima hanya oleh manusia).

## 2. Autentikasi

HMI memakai sesi yang sama dengan dashboard: cookie `JSESSIONID` +
token CSRF. Login sekali saat boot, simpan cookie di jar.

| Endpoint | Method | Balasan |
|---|---|---|
| `/api/v1/auth/login` | POST `{username, password}` | `200 {username, role}` · `401 {error:"Username atau password salah"}` |
| `/api/v1/auth/me` | GET | `200 {username, role, ...}` · `401 {error:"Belum login"}` |
| `/api/v1/auth/csrf` | GET | `200 {token}` |
| `/api/v1/auth/logout` | POST | `200 {success:true}` |

`role` sudah dinormalisasi backend (prefix `ROLE_` dibuang, lowercase,
default `operator`).

Setiap `POST` **wajib** menyertakan header `X-XSRF-TOKEN` berisi token
dari `/auth/csrf`. CSRF aktif; tanpa header itu → `403`.

### 2.1 Autentikasi WebSocket

Handshake `medical-ws` **tidak** memakai cookie sesi. Header yang wajib:

```
Authorization: Bearer <WS_AUTH_TOKEN>
```

Perbandingan **persis sama** (`server.js` `authorizeUpgrade`). Bila
`WS_AUTH_TOKEN` di gateway kosong, **semua** koneksi ditolak dan socket
ditutup dengan kode `4401` (`UNAUTHORIZED`).

Karena React Native bisa menyetel header handshake (`new WebSocket(url,
[], { headers })` pada RN, atau `WebSocket` + `Cookie`/`Authorization`
lewat polyfill), HMI **bisa** memakai jalur ini. Dashboard web **tidak
bisa** (lihat §7).

Token **tidak boleh** lewat query param atau URL (AGENTS.md aturan 5).
Token di log hanya prefix 4 karakter (aturan 7).

## 3. Koneksi WebSocket

```
ws://<host>:8081/ws/v1/deliveries
```

Path dan port dari env (`WS_PATH`, `WS_PORT`), jangan hardcode
(AGENTS.md aturan 4).

### 3.1 Urutan handshake

1. HMI connect dengan header `Authorization` (§2.1).
2. Gateway mengirim `SNAPSHOT_REQUIRED` **sebelum** klien terdaftar:

   ```json
   { "action": "SNAPSHOT_REQUIRED", "reason": "CONNECT" }
   ```

   Artinya: gateway tidak menyimpan backlog. HMI harus menarik keadaan
   awal sendiri lewat REST (§5) — event WS hanya untuk perubahan
   **setelah** koneksi.

3. HMI **wajib** mengirim `subscribe`. Tanpa ini HMI tidak menerima
   event apa pun — kanal awal setiap socket adalah himpunan kosong dan
   himpunan kosong tidak cocok dengan envelope mana pun.

   ```json
   { "action": "subscribe", "channels": ["all"] }
   ```

   Balasan sukses: `{ "action": "SUBSCRIBED", "channels": ["all"] }`.
   Balasan gagal: `{ "action": "ERROR", "code": "...", "detail": "..." }`
   dengan `code` ∈ `INVALID_JSON`, `NO_VALID_CHANNEL`, `UNKNOWN_ACTION`.

   Kanal yang tersedia:

   | Kanal | Cocok dengan |
   |---|---|
   | `all` | semua envelope |
   | `ward:<wardCode>` | `envelope.wardCode` |
   | `delivery:<requestCode>` | `envelope.requestCode` |

   HMI satu robot sebaiknya berlangganan `ward:<wardCode>` bangsalnya,
   bukan `all`, agar tidak memproses misi robot lain.

4. Heartbeat: gateway mengirim ping tiap `PING_INTERVAL_MS` (default
   15 dtk) dan memutus socket yang tidak menjawab pong dalam
   `PONG_TIMEOUT_MS`. Library WS standar menjawab pong otomatis.

### 3.2 Bentuk envelope

Semua event WS adalah envelope yang sama; HMI **wajib** memfilter
`type` dan mengabaikan tipe yang tidak dikenal (forward compatible).

```json
{
  "v": 1,
  "eventId": "b1f0c2c4-2f6a-4b0e-9c1d-6a0f2c9d51aa",
  "type": "MISSION_EVENT",
  "occurredAt": "2026-10-23T04:15:00.000Z",
  "requestCode": "DELIV-20261023-0007",
  "wardCode": "WARD-ISOLASI-A",
  "data": { }
}
```

`eventId` dipakai untuk dedupe (gateway sudah dedupe selama
`DEDUPE_TTL_MS`, default 15 menit; HMI tidak perlu mengulang).
Envelope yang tidak punya `requestCode` **dan** `wardCode` non-kosong
tidak akan pernah sampai — gateway menolaknya lebih dulu.

## 4. Event yang diterima

### 4.1 `MISSION_EVENT`

Selalu memuat: `missionId`, `status`, `simulated:true`, `requestCode`,
`wardCode`. Sisanya tergantung titik emisi:

| Momen | `status` | Field tambahan |
|---|---|---|
| Misi dimulai | `EXECUTING` | `progress:0`, `message:"Memulai perjalanan menuju <waypoint>"` |
| Progres berkala (500 ms) | `EXECUTING` | `progress` (0–99), `currentPose {x,y,yaw}` — **tanpa** `message` |
| Tiba di tujuan | `SUCCEEDED` | `progress:100`, `message:"Robot berhasil tiba di lokasi tujuan"` |
| Dibatalkan operator | `CANCELLED` | `message:"Misi dibatalkan oleh pengguna"` — **tanpa** `progress` |

Konsekuensi untuk HMI: `message` dan `progress` **opsional**. Jangan
memakai `message` sebagai satu-satunya penentu tampilan; penentu utama
adalah `status` (§6).

Status yang mungkin muncul di `data.status` (enum
`mission_status` di DB): `SUBMITTED`, `BACKEND_ACCEPTED`,
`ROBOT_ACKNOWLEDGED`, `EXECUTING`, `SUCCEEDED`, `FAILED`, `CANCELLED`,
`UNKNOWN`. Dalam praktik fase mock hanya `EXECUTING`, `SUCCEEDED`, dan
`CANCELLED` yang di-broadcast; empat status pertama ditulis ke DB tanpa
broadcast. HMI harus siap menerima `FAILED` dan `UNKNOWN` kelak.

`FAILED` belum pernah dikirim hari ini (robot simulasi tidak gagal).
HMI tetap harus punya tampilan untuk itu.

### 4.2 `TELEMETRY`

Dikirim tiap tick 500 ms, setelah logika misi:

```json
{
  "type": "TELEMETRY",
  "data": {
    "robotId": "ROBOT-01",
    "name": "Nevo Delivery 01",
    "status": "MOVING",
    "mode": "SIMULATED",
    "battery": 87.4,
    "pose": { "x": 1.25, "y": 3.1, "yaw": 0.0 },
    "speed": 0.55,
    "activeMissionId": 42,
    "simulated": true,
    "lastSeen": "2026-10-23T04:15:00.000Z"
  }
}
```

`battery` 1 desimal (lantai `10.0`), `pose` 2 desimal. `activeMissionId`
`null` bila tidak ada misi aktif. Pakai `battery` untuk indikator daya
dan `activeMissionId` untuk memutuskan apakah wajah harus
"sedang bertugas".

## 5. Read API (sumber keadaan awal)

Semua `GET` di bawah ini tidak butuh CSRF, hanya sesi. Base
`http://<host>:8080/api/v1`.

| Endpoint | Guna di HMI |
|---|---|
| `GET /robots` | keadaan robot saat boot |
| `GET /missions?limit=50` | misi terbaru (`created_at DESC`; `limit` default 50) |
| `GET /missions/{id}` | detail + `events[]` urut `happened_at ASC` (404 `"Misi tidak ditemukan"`) |
| `GET /integrations/simrs/status` | mode integrasi SIMRS |

Endpoint tulis yang mungkin dipakai operator (bukan HMI, tapi HMI boleh
menampilkan tombolnya): `POST /missions`, `POST /missions/{id}/cancel`,
`POST /integrations/simrs/delivery-status`.

Alur boot HMI: login → `GET /robots` + `GET /missions?limit=1` →
tampilkan wajah → buka WS → kirim `subscribe` → baru percayai event.

## 6. Wajah robot

HMI memakai desain wajah **sendiri** (bukan wajah `tifa-app`). Wajah
adalah fungsi murni dari (status misi, hasil scan); tidak ada state
wajah yang disimpan.

| Kondisi | Wajah | Catatan |
|---|---|---|
| Tidak ada misi aktif | `senyum` | idle, mata berkedip lambat |
| `SUBMITTED` / `BACKEND_ACCEPTED` / `ROBOT_ACKNOWLEDGED` | `fokus` | misi diterima, belum jalan |
| `EXECUTING` | `fokus` | arahkan pandangan sesuai `currentPose.yaw` bila ada |
| `SUCCEEDED` (tiba) | `senyum` lebar | |
| Menunggu scan gelang | `menunggu` | mulut netral, mata memandang ke bawah (ke gelang) |
| Scan valid | `senang` | tampil **bersamaan** dengan nomor kompartemen |
| Scan kedaluwarsa / MRN tidak cocok | `sedih` | |
| `CANCELLED` | `kecewa` | |
| `FAILED` / `UNKNOWN` | `sedih` | |
| Baterai ≤ 15% | `lelah` | overlay kecil, tidak menimpa wajah utama |

Wajah minimal yang harus ada di fase 4: `senyum`, `fokus`, `menunggu`,
`senang`, `sedih`, `kecewa`, `lelah`. Ekspresi adalah keputusan desain
HMI, **bukan** kontrak backend; tabel ini hanya memetakan status →
ekspresi supaya tidak ada dua sumber kebenaran.

## 7. Celah yang diketahui (jangan "diperbaiki" diam-diam)

1. **Dashboard web tidak bisa memakai WS.** Browser `WebSocket` tidak
   bisa menyetel header `Authorization`, dan gateway hanya menerima
   `Bearer` di header. Dashboard karena itu memakai polling REST, bukan
   event. HMI tidak terkena batasan ini (RN bisa menyetel header).
   Perbaikan (sesi cookie di handshake) **ditunda**; jangan menambah
   token lewat query param — melanggar AGENTS.md aturan 5.
2. **Tidak ada backlog.** `SNAPSHOT_REQUIRED` adalah pengingat, bukan
   data. HMI wajib menarik keadaan awal lewat REST (§5).
3. **Belum ada prefiks tenant.** Kanal `ward:`/`delivery:` belum
   berprefiks `company:<id>:`. Aman selama fase mock single-tenant;
   ditambahkan bersama `m_company`.

## 8. Konfigurasi

```yaml
# medical-ws/.env
WS_PORT: 8081
WS_PATH: /ws/v1/deliveries
WS_AUTH_TOKEN: ""            # kosong = semua koneksi ditolak (4401)
PING_INTERVAL_MS: 15000
PONG_TIMEOUT_MS: 15000
DEDUPE_TTL_MS: 900000
```

```yaml
# medical-hmi/.env
EXPO_PUBLIC_API_BASE_URL: http://<host>:8080
EXPO_PUBLIC_WS_URL: ws://<host>:8081/ws/v1/deliveries
EXPO_PUBLIC_WS_TOKEN: ""     # = WS_AUTH_TOKEN gateway
```

Tidak ada port/URL/token hardcode di kode HMI (AGENTS.md aturan 4).
Token hanya di `.env`, tidak pernah dicommit.

## 9. Yang ditunda

- Autentikasi WS lewat cookie sesi (agar dashboard web bisa ikut).
- Prefiks tenant pada kanal (`company:<id>:ward:<code>`), bersama
  `m_company`.
- Replay/backlog event untuk HMI yang baru connect.
- Perintah balik HMI → robot (mis. "ulangi panduan") lewat WS; fase mock
  memakai `POST /missions/{id}/cancel` saja.
- Logika kamera baki (tugas rekan, di luar cakupan kontrak ini).

## 10. Tambahan kontrak (aditif) — identitas, laporan, INIT

Keputusan dicatat 2026-11-23 (AGENTS.md aturan 6), disetujui Rayhan.
Semua perubahan **aditif**; klien lama yang mengabaikan field baru tetap jalan.

### 10.1 `BRIEF` — field baru

```jsonc
{
  "code": "BRIEF",
  "data": {
    "sequence": 1,
    "items": [ /* tetap seperti sebelumnya */ ],
    "patient": {
      "mrnHash": "<sha256 hex 64 karakter dari MRN>",
      "initials": "B.S.",
      "allergies": ["Ibuprofen"]
    },
    "scheduleUrl": "https://<SIMRS>/jadwal/<requestCode>?t=<token HMAC>"
  }
}
```

- Tablet **tidak** menerima nama atau MRN mentah. Gelang dipindai lalu
  di-hash di tablet dan dibandingkan dengan `mrnHash`.
- `mrnHash` yang bukan 64 hex dibuang; berarti verifikasi gelang dilewati
  (`identity.method = "not_required"`).
- Sumber: SIMRS `GET /api/v1/monitoring/active-deliveries` → field `hmi`
  per delivery (`src/lib/hmi-brief.ts`).
- `scheduleUrl` membuka halaman publik `/jadwal/<code>`. Token HMAC berprefiks
  `jadwal:` dan berumur `SCHEDULE_TOKEN_TTL_SECONDS` (default 259200 = 3 hari).
  Halaman hanya menampilkan inisial, alergi, dan jadwal (tanpa nama/MRN).

### 10.2 `HMI_REPORT` (HMI → gateway, baru)

Dikirim sekali setelah `PRESENT_DONE`. **Tidak** diteruskan ke robot.

```jsonc
{ "code": "HMI_REPORT", "data": {
  "robot_id": "NEVO-01", "sequence": 1,
  "arrivedAt": "2026-11-23T03:00:00.000Z", "presentDoneAt": "2026-11-23T03:02:10.000Z",
  "identity": { "required": true, "verified": true, "method": "camera|keyboard|nurse_override|not_required", "mismatches": 0 },
  "allergyShown": true, "replays": 1, "notUnderstood": 0, "doctorCalled": false,
  "teachBack": { "asked": true, "correct": true }, "scheduleQrShown": true } }
```

- Gateway (`medical-ws/src/core/hmi-report.js`) memvalidasi whitelist,
  membuang field lain, menambah `robot_id`, `timestamp`, `source:"HMI"`, lalu
  `produce(TOPIC_ROBOT_EVENTS)` + broadcast UI, dan membalas `HMI_REPORT_ACK`.
- Laporan tidak valid → `ERROR {error:"INVALID_REPORT"}`.
- Jalur WS lokal robot (port 8765): bridge robot **wajib** me-relay
  `HMI_REPORT` ke gateway sebagai uplink biasa (gateway sudah menerima kode
  apa pun dari sesi ROBOT). Ini celah tim robot yang belum dikerjakan.

### 10.3 `INIT` — rincian pemeriksaan

`nevo_diagnostic_node` kini menambahkan ke `data`:

```jsonc
"mode": "NAVIGATION|MAPPING", "elapsed_sec": 12, "timeout_sec": 60,
"checks": [
  { "id": "nav_service", "label": "Layanan navigasi", "state": "ACTIVE|INACTIVE|FAILED|UNKNOWN", "required": true },
  { "id": "mapping_service", "label": "Layanan mapping", "state": "...", "required": false },
  { "id": "map", "label": "Peta", "state": "OK|WAIT|FAIL", "required": true },
  { "id": "amcl", "label": "Lokalisasi", "state": "...", "required": true },
  { "id": "odom", "label": "Odometri", "state": "...", "required": true }
]
```

`status` tetap `INITIALIZING | READY | FAILED`. HMI: INITIALIZING → layar
"Menyiapkan sistem" dengan daftar `checks`; READY → IDLE; FAILED → layar
gangguan berisi `message`. State layanan dibaca dari `systemctl is-active`
(param `nav_service`, `mapping_service`, `require_service` di
`config/diagnostic_params.yaml`).

**Status implementasi (dicek dari kode robot `0143a36`, 2026-11-24):** field §10.3
di atas BELUM dikirim robot (perubahan diagnostic yang menambahkannya hilang, lihat
`docs/REFERENSI-ROBOT-TIFA.md` T5). Frame yang benar-benar diterima HMI lewat
`nevo_ws_bridge` (WS lokal 8765, `sendToAll` dari `/nevo/ws_out`), sama untuk
`nevo.service` (navigasi, dulu `tifa-service`) dan `nevo-mapping.service`
(pemetaan, dulu `tifa-mapping-service`) karena keduanya menjalankan
`nevo_diagnostic_node` (param `mode`):

| Frame | Isi `data` | Kapan |
|---|---|---|
| `INIT` INITIALIZING | `init_message: "System boot started. Waiting for grace period."` | sekali saat node mulai (masa tenggang: nav 30 dtk, mapping 10 dtk) |
| `INIT` INITIALIZING | `"Grace period elapsed. Checking system readiness."`, lalu `"Checking system topics… elapsed N s."` | tiap 1 dtk saat memeriksa (nav: /map + /amcl_pose + /odometry/filtered; mapping: odometri saja) |
| `INIT` READY | `"All systems operational. Robot is ready."` | **sekali** |
| `INIT` FAILED | alasan, mis. `"Global timeout (300 s). No /amcl_pose received."` | sekali; robot lalu me-restart `nevo.service` |
| `READY` (nevo_robot_api) | `{ mode: "mapping" \| …, ready: true }` | tiap 5 dtk selama 90 dtk pertama + saat cloud tersambung ulang |

HMI (`medical-hmi/src/states/machine.ts`) menerima keduanya: field §10.3 bila ada;
bila tidak, detik diambil dari pesan, tahap dari teks pesan, daftar periksa dari
`waiting for: map amcl odom` (bila ada), mode dari `READY.mode`. Status
`CHECKING_*`/`ERROR` (dikenal nevo-app/tifa-app) dinormalkan ke INITIALIZING/FAILED.
`READY` robot_api tidak memotong layar persiapan selama `INIT` masih segar
(< 30 dtk; masa tenggang < 120 dtk), agar layar tidak berkedip.
Saran untuk tim robot (T5): kirim ulang INIT tiap 1 dtk juga selama masa tenggang,
karena HMI yang tersambung setelah detik 0 tidak menerima pesan tenggang.

### 10.4 Koneksi & Pengaturan tablet — disetujui owner 26/11/2026 (sisi gateway selesai; sisi HMI: langkah 3–5)

Pasangan dari `robot-ws-tifa.md` §3a (pairing) dan uplink `EMERGENCY_STOP`.

**Jalur** (dipilih di Mode Perawat → Pengaturan → Koneksi; Robot ID/UI ID bisa diubah manual, bawaan dari env):

| Jalur | Tujuan | Handshake |
|---|---|---|
| `gateway` (utama) | `medical-ws` lewat Wi-Fi | `SI UI` + `device_token` (pairing) |
| `local` | WS lokal robot (`nevo_ws_bridge`) lewat Wi-Fi | tanpa SI, frame apa adanya |
| `usb` | ADB forward `127.0.0.1:<port>` lewat plugin WebSocket native Android | sama dengan `local`. Disiapkan, disetel di robot nanti |

**Nilai bawaan dari env** (bukan dari kode): `VITE_WS_URL`, `VITE_LOCAL_WS_URL`,
`VITE_ROBOT_ID`, `VITE_UI_ID`, `VITE_USB_PORT`. Nilai yang diubah di Pengaturan
menimpa nilai bawaan. Jalur §8 (`EXPO_PUBLIC_*`) sudah usang.

**Penyimpanan**:
- `instance_id`: UUID yang dibuat sekali per instalasi.
- `device_token`: disimpan di penyimpanan aplikasi native (`@capacitor/preferences`), bukan localStorage web, dan dihapus lewat "Lupakan perangkat" (`UNPAIR`). Di log hanya muncul 4 karakter awal.
- Token bersama tidak lagi dipakai tablet.

**Status sambungan** (ditampilkan di Pengaturan dan Diagnostik):
`off → connecting → open → session` (setelah `ACK_SOFT`). Status khusus:
- `replaced`: close 4001, tidak reconnect, ada tombol "Sambung lagi".
- `revoked`: close 4002 / `DEVICE_UNPAIRED`, lalu minta pairing ulang.
- `duplicate`: `DUPLICATE_UI_ID`, retry 3 → 5 → 10 → 20 → 30 detik, dengan tombol manual "Ambil alih sesi" (`force`).

Putus biasa → reconnect 3 → 30 detik ditambah acakan ≤ 1 detik, maksimal 20 kali,
lalu menunggu tombol "Coba lagi".

**`EMERGENCY_STOP`**: dari state apa pun, HMI langsung masuk layar henti darurat
(merah, tanpa animasi, kalimat tetap "Robot berhenti darurat. Perawat akan
membantu."). Presentasi dan panggilan dihentikan. Layar keluar hanya saat robot
mengirim `STATUS`/`READY` berikutnya, atau perawat menekan "Selesai" di Mode Perawat.
