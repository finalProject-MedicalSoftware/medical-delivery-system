# Kontrak Integrasi: SIMRS Dummy ke Web Monitoring (API + WebSocket + Kafka)

> Status per 2026-10-31: HTTP read/status tetap kontrak mock; gateway `medical-ws`
> sudah menjalankan bridge HTTP → Kafka → WebSocket, dan dashboard menerima
> stream melalui BFF/SSE. SIMRS Dummy memiliki outbox + relay webhook. Jalur
> keseluruhan masih sintetis/demo; integrasi SIMRS live dan robot fisik belum
> diverifikasi. BAGIAN 2–3 di bawah mencatat implemented baseline serta target
> lanjutan; detail status/rencana ada di `docs/web-monitoring/IMPLEMENTATION_STATUS.md`.
> Sumber label/tone/transisi: `simrs-dummy/medical-simrs-web/src/lib/delivery-status.ts`.
>
> Batas tetap: SIMRS Dummy tidak menjalankan WS atau Kafka. Kafka berada di
> `medical-ws`; backend mengirim ke HTTP bridge, bukan produce Kafka langsung.

## 0. Pihak dan komponen

| Komponen | Folder | Status sekarang | Peran |
|---|---|---|---|
| SIMRS Dummy (Next.js) | `simrs-dummy/medical-simrs-web/` | Outbox + relay webhook tersedia; demo/sintetis | Sumber data pengantaran, status, pasien |
| Medical backend | `medical-backend/` | REST/mock + HTTP publish bridge client | API robot/simulasi dan pengirim event ke gateway |
| Web Monitoring (dashboard) | `medical-dashboard-monitoring/` | BFF/SSE stream dan UI monitoring | Konsumen status untuk staf |
| WS/Kafka gateway | `medical-ws/` | Aktif: HTTP bridge → Kafka → WS | Produksi/konsumsi topik dan broadcast |
| HMI robot | `medical-hmi/` | Belum dimulai | Konsumen masa depan setelah kontrak/owner tersedia |
| Robot NEVO | `robot/` | Simulator; hardware belum terhubung | Uplink robot fisik masa depan |

DB SIMRS Dummy dan DB Web Monitoring HARUS terpisah (AGENTS.md aturan 1).

## 1. Bagian HTTP (FINAL fase mock)

Ringkasan, detail di `monitoring-events.md`:

| Endpoint | Metode | Isi |
|---|---|---|
| `/api/v1/monitoring/snapshot?since=ISO&limit=200` | GET | Pasien aktif, pengantaran berubah, ruang+bed full |
| `/api/v1/monitoring/patient/[mrn]` | GET | Lookup 1 pasien + activeDeliveries |
| `/api/v1/monitoring/active-deliveries?limit=200` | GET | Antrian pengantaran berjalan |
| `/api/v1/monitoring/mapping` | GET | YAML: ward/room/bed live, peta status, polling |
| `/api/v1/monitoring/delivery-status` | POST | Monitoring melapor status robot |

Aturan yang wajib dipatuhi konsumen:

1. Auth machine: header `x-monitoring-token: <MONITORING_TOKEN>`. Salah: `401`; token server belum diset: `503` fail-closed.
2. Cocokkan status via **kode**, bukan label. Label `MOCK_*` berprefix `[MOCK]` dan bisa berubah.
3. `compartmentNo`: integer `>= 0`, HANYA bermakna saat lapor `MOCK_ARRIVED_AT_ROOM`. Tidak ada endpoint read yang me-return-nya.
4. `idempotencyKey` regex `^[A-Za-z0-9._:-]{1,64}$`. Replay kombinasi sama -> `200 duplicate:true`. Kombinasi beda -> `409` + `idempotencyKeyUsedFor`.
5. `MOCK_HANDOVER_CONFIRMED` TIDAK bisa dilempar via API (422). Serah-terima HANYA manusia login di `/scan/[mrn]`.
6. QR wristband berisi HANYA `{base}/scan/{mrn}?t={exp}.{sig}` — URL scan + token tanda tangan HMAC, tanpa data klinis. Token diverifikasi sebelum pasien di-query.
7. `isInfectious: true` = ALERT wajib tampil (kewaspadaan kontak/droplet/airborne).
8. Halaman web monitoring WAJIB fetch `/api/v1/monitoring/mapping` tiap 30 detik atau saat boot.

### 1.1 Kebijakan retry sisi monitoring (draf, tapi sebaiknya dipakai sejak sekarang)

Saat `POST /api/v1/monitoring/delivery-status` gagal:

| Hasil | Perlakuan |
|---|---|
| Network error, timeout, `5xx` | Retry backoff `1s, 5s, 30s, 2m`, maks 5 kali. Kunci `idempotencyKey` SAMA untuk semua retry |
| `422` | STOP. Transisi tidak sah; jangan retry. Tampilkan di UI admin dan rekonsiliasi lewat snapshot |
| `404` | STOP. requestCode tidak dikenal SIMRS. Rekonsiliasi lewat snapshot |
| `409` | STOP. Bug pola key di sisi monitoring. Tampilkan `idempotencyKeyUsedFor` untuk diagnosis |
| `401` | STOP. Token salah/rotate. Alert ke admin |

**Status implementasi (2026-10-22):** kebijakan pada tabel di atas sudah diimplementasi di `medical-backend` (`SimrsClientService.sendDeliveryStatusWithRetry`):

- Retryable: network error/timeout/`5xx` (plus `429`), backoff diskrit `1s, 5s, 30s, 2m`, idempotencyKey SAMA di semua percobaan, maks `SIMRS_WRITE_MAX_ATTEMPTS` percobaan (default 5).
- Non-retryable (`422/404/409/401` dan `4xx` lain): tidak diretry; hasil dikembalikan ke pemanggil untuk ditampilkan/erekonsiliasi.
- Push status robot (`MOCK_IN_TRANSIT` / `MOCK_ARRIVED_AT_ROOM` / `CANCELLED`) bersifat fire-and-forget di thread daemon `simrs-writer`: kegagalan write TIDAK membuat misi robot gagal; rekonsiliasi tetap lewat snapshot.
- Detail hasil POST memuat field `attempts` (jumlah percobaan terpakai) untuk diagnosis.
- Endpoint manual admin `POST /api/v1/integrations/simrs/delivery-status` kini mengembalikan body hasil (termasuk `httpStatus` SIMRS) alih-alih 503 untuk semua kegagalan HTTP sisi SIMRS.

### 1.2 Delta kontrak: pengajuan terjadwal (2026-10-27)

Resep SIMRS dapat membawa jadwal minum; generator SIMRS membuat
`DeliveryRequest` berulang otomatis. Monitoring hanya membaca.

- `GET /api/v1/monitoring/active-deliveries` — tiap item bertambah:
  - `dueAt` (ISO string; `null` untuk pengajuan manual tanpa jadwal)
  - `doseTime` (string `HH:mm`, untuk tampilan; `null` bila `dueAt` null)
  - `schedule`: `null` atau objek
    `{ doseTimes: string[], repeatMode: "DAILY" | "INTERVAL", intervalDays?: number, predictedExhaustDate?: string }`
- Penanda "terlambat" ditentukan sisi monitoring: `dueAt < waktu amatan`. SIMRS tidak mengirim field late.
- Idempotensi generator: UNIQUE `(prescriptionId, dueAt)` pada `t_delivery_request`. Baris manual (`dueAt` NULL) tidak berinteraksi dengan generator (Postgres mengizinkan banyak NULL pada unique).
- Pengulangan berhenti pada prediksi habis obat ATAU `patient.dischargedAt`, mana duluan. Generator hanya membuat slot masa depan dalam window look-ahead env `DELIVERY_SCHEDULE_HORIZON_HOURS` (default 24 jam) di sisi SIMRS.

**Status implementasi (2026-10-27)** — sisi SIMRS Dummy (`simrs-dummy/medical-simrs-web`):

- Generator dijalankan di tiga titik: (a) transisi resep ke `READY` di server action simpan resep, (b) polling tiap 15 menit + catch-up 5 detik saat boot via `instrumentation.ts` → `src/lib/schedule-poll.ts` (hanya runtime `nodejs`; bundel edge tidak menyertakan driver PG), (c) tombol "Sinkron Jadwal" di `/pengantaran` (server action, redirect balik dengan `?sync=N`).
- Idempotensi: `createMany({ skipDuplicates: true })` atas UNIQUE `(prescriptionId, dueAt)`; retry/polling ulang tidak menduplikasi slot.
- Slot dibuat dengan `notes` `[SIMULATED] pengajuan terjadwal otomatis`, aktor `sysadmin@simrs.local`; `dueAt` = tanggal+jam dose-time masa depan dalam horizon (API monitoring mend derivasi `doseTime` dari jam `dueAt`).
- Keterbatasan: prediksi habis obat dari `daysOfStock = floor(stock/perDay)` dihitung dari HARI INI (stok dipotong sekali saat PREPARING→READY); tidak ada view admin untuk mengelola slot terjadwal.
- Env baru: `DELIVERY_SCHEDULE_HORIZON_HOURS` (default `24`).

### 1.3 Klarifikasi: status "tiba" masih aktif, serah-terima tetap QR (2026-11-02)

Bug yang dilaporkan: pengantaran yang sudah `MOCK_ARRIVED_AT_ROOM` masih bisa diajukan ulang dari resep dan
tombol aksi di halaman pengantaran hilang (tidak ada jalan keluar).

Akar masalah: daftar status aktif untuk cek duplikat masih versi lama (3 status) yang tidak memuat
`MOCK_ARRIVED_AT_ROOM`, sedangkan read API monitoring sudah memakai 4 status.

Penetapan (tidak ada perubahan kontrak read/write):

- **Satu sumber kebenaran status aktif** = `ACTIVE_DELIVERY_STATUSES` di
  `simrs-dummy/medical-simrs-web/src/lib/delivery-status.ts`
  (`DELIVERY_REQUESTED`, `PENDING_INTEGRATION`, `MOCK_IN_TRANSIT`, `MOCK_ARRIVED_AT_ROOM`).
  Gate duplikat server action, guard tombol "Ajukan Pengantaran", dan filter `/pengantaran/baru` memakai
  konstanta itu — bukan array hardcoded.
- Implikasi bagi konsumen: selama `status` masih di daftar itu (termasuk sudah tiba), resep **tidak bisa**
  diajukan pengantaran baru. Pengantaran ulang baru boleh setelah `MOCK_HANDOVER_CONFIRMED` (resep kembali
  tidak punya pengantaran aktif).
- `DELIVERY_TRANSITIONS` tidak berubah: `MOCK_ARRIVED_AT_ROOM → MOCK_HANDOVER_CONFIRMED` hanya lewat scan QR
  manusia di `/scan/[mrn]?t=…`. Aturan 5 di §1 tetap berlaku; status "tiba" masih bisa `CANCELLED` lewat
  endpoint monitoring sesuai tabel transisi.
- UI halaman pengantaran untuk status tiba hanya menampilkan tautan: **Buka Scan QR Pasien** (jalur
  serah-terima) dan **Selesaikan Rawat Inap** (discharge pasien, bukan transisi status pengantaran). Tidak ada
  tombol yang menambah jalur transisi baru.

## 2. Bagian WebSocket (BASELINE AKTIF — gateway `medical-ws`; perlu verifikasi E2E ulang)

> **Status implementasi (2026-10-30):** server WS berjalan di `medical-ws`
> (Node.js `ws` + `kafkajs`), bukan di dashboard. Komponen:
> - `medical-ws/src/ws/server.js` — handshake Bearer, subscribe channel,
>   validasi + dedupe `eventId`, broadcast, heartbeat (ping 15s / pong 15s).
> - `medical-ws/src/kafka/consumer.js` — consume `simrs.delivery.events.v1` →
>   `onDeliveryEvent`.
> - Dashboard (`medical-dashboard-monitoring`) memakai relay SSE di BFF
>   (`/api/ws/stream`), bukan WS langsung dari browser — lihat §2.2.

### 2.1 Trigger untuk mulai

Baseline gateway WS sudah diimplementasi; syarat berikut tetap menjadi gate sebelum mengaktifkan aliran produksi/live dan menghapus fallback polling:

1. HTTP di BAGIAN 1 teruji end to end dengan kredensial dan data yang disetujui pemilik SIMRS.
2. Web monitoring minimal viable dan resync snapshot teruji.
3. Kebutuhan latensi nyata diukur dan disetujui operator.
4. Owner operasi, auth, observability, dan prosedur rollback disepakati.
5. Keputusan arsitektur tetap: gateway berada di `medical-ws`; SIMRS bukan host WS.

### 2.2 Arsitektur disepakati dan status

SIMRS Dummy TIDAK menjalankan WebSocket. Aliran baseline saat ini:

```
SIMRS  --(polling snapshot, fallback)-->   Web Monitoring (dashboard)
Web Monitoring  --(POST status)-->  SIMRS
Backend (medical-backend) --(bridge HTTP POST /internal/publish)--> medical-ws --(WebSocket)--> Klien WS
                                                                    medical-ws --(Kafka produce/consume)--> simrs.delivery.events.v1
Dashboard  --(SSE /api/ws/stream via BFF)-->  medical-ws
```

- Dashboard menggunakan BFF/SSE relay (`/api/ws/stream`) untuk menerima stream dari gateway; polling snapshot tetap fallback dan sumber resync.
- SIMRS outbox relay mengirim webhook ke callback yang dikonfigurasi: `POST {MONITORING_CALLBACK_URL}/webhooks/simrs`, header `x-simrs-token`, body Envelope (§2.4).

> **Status 2026-10-31:** outbox + relay tersedia di SIMRS Dummy; gateway `medical-ws` dan jalur dashboard BFF/SSE tersedia. Jangan menganggap konektivitas live/Cloudflare, kredensial owner, atau acceptance SIMRS telah terverifikasi tanpa bukti E2E terbaru. Jika callback/dashboard receiver belum terhubung dalam environment aktif, catat sebagai gap verifikasi, bukan mengklaim integrasi selesai. Relay tanpa env callback tidak mengirim event; gunakan konfigurasi lokal aman untuk uji.

### 2.3 Protokol WS yang diusulkan

- Endpoint: `wss://<host-monitoring>/ws/v1/deliveries`
- Auth di handshake:
  - Browser: cookie sesi `simrs_session` (atau sesi monitoring) ikut otomatis same-origin.
  - Klien machine: header `Authorization: Bearer <token>`.
  - Gagal auth: server close dengan code `4401`.
- Subscribe (client -> server):

```json
{ "action": "subscribe", "channels": ["all"] }
```

  Channel yang diizinkan: `all`, `ward:<wardCode>`, `delivery:<requestCode>`. Server balas: `{ "type": "SUBSCRIBED", "channels": ["all"] }`.

- Envelope event (server -> client), SATU bentuk untuk WS dan Kafka:

```json
{
  "v": 1,
  "eventId": "uuid-v4",
  "idempotencyKey": "nevomock-deliv-0001-step2",
  "type": "DELIVERY_STATUS_CHANGED",
  "occurredAt": "2026-10-18T13:00:00.000Z",
  "requestCode": "DELIV-20261018-0001",
  "wardCode": "A",
  "data": {
    "from": "PENDING_INTEGRATION",
    "to": "MOCK_IN_TRANSIT",
    "statusLabel": "[MOCK] Transit",
    "note": "Robot berangkat",
    "source": "monitoring"
  }
}
```

- Tipe event draf:
  - `DELIVERY_CREATED`: pengantaran baru dibuat di SIMRS.
  - `DELIVERY_STATUS_CHANGED`: transisi apa pun yang sah.
  - `DELIVERY_ARRIVED`: `data.compartmentNo` ikut HANYA di sini.
  - `HANDOVER_CONFIRMED`: `data = { patientMrn, compartmentNo, method: "QR_SCAN" }`; berasal dari scan manusia.
  - `DELIVERY_CANCELLED`.
  - `SNAPSHOT_REQUIRED`: server menyuruh klien resync penuh (mis. layanan monitoring restart).

### 2.4 Reliabilitas (wajib, bukan opsional)

1. Ping server tiap 15 detik, klien wajib `pong` dalam 15 detik, jika tidak server close.
2. Reconnect klien: backoff `1s, 2s, 5s, 10s, 30s` (maks 30s) dengan jitter.
3. Setiap connect/RE-connect: klien melakukan resync penuh via `GET /api/v1/monitoring/active-deliveries` (kontrak final) SEBELUM memercayai push yang datang.
4. Dedupe klien by `eventId` (simpan 15 menit terakhir). At-least-once, jadi duplikat akan terjadi.
5. Order TIDAK dijamin lintas channel. Klien menerapkan event secara idempotent; bila ada gap status, fetch ulang read API.
6. Fallback polling: bila gagal connect 5 kali dalam 2 menit, turun ke polling read API tiap 10-30 detik, coba WS lagi tiap 60 detik.
7. Halaman yang disarankan pakai WS: dashboard dan detail pengantaran. Halaman `/scan/[mrn]` tetap tanpa WS (manusia sedang memegangnya).

### 2.5 Verifikasi dan enhancement berikutnya

- Verifikasi receiver webhook, auth, dedupe, persistensi/outbox, dan relay SSE dashboard dalam satu alur E2E.
- Selaraskan kontrak event status yang dikirim backend, webhook SIMRS, Kafka, dan konsumen UI; catat mismatch serta fixture Postman.
- Pertahankan polling fallback dan resync saat connect/reconnect.
- Jangan menambah broker di SIMRS atau WS browser langsung dari SIMRS.

## 3. Bagian Kafka (AKTIF — gateway `medical-ws`)

### 3.1 Trigger untuk mulai

Semua harus terpenuhi:

1. Minimal 2 konsumen nyata membutuhkan event yang sama (mis. dashboard monitoring + HMI, atau monitoring + integrator NEVO).
2. Integrasi NEVO/SIMRS nyata sudah dikontrak (bukan `MOCK`), karena topology topic harus memuat event robot `REAL_*` juga.
3. Ada target latensi tertulis (mis. p95 < 5 detik) yang polling tidak bisa capai.
4. Ada tim/jaringan yang benar-benar menjalankan broker (setidaknya 1 broker lab, 3 broker produksi).

Jika salah satu gagal, jawabannya TETAP webhook + polling dari BAGIAN 1/2.

### 3.2 Topology disepakati

| Topik | Produsen | Key pesan | Catatan |
|---|---|---|---|
| `simrs.delivery.events.v1` | `medical-ws` (dari bridge HTTP) | `requestCode` | Semua tipe event Envelope v1 di 2.3 |
| `simrs.delivery.events.dlq` | `medical-ws` | `null` | Pesan gagal format/validasi; header `dlqReason` |
| `simrs.robot.events.v1` | NEVO/integrator (kelak) | `robotId` | Uplink STATUS/ACK/POSITION; TIDAK dikonsumsi sebelum NEVO nyata |
| `simrs.robot.command` | integrator robot (kelak) | `robotId` | Downlink perintah (`ROBOT_COMMAND`/`ROBOT_COMMAND_RESULT`) |

- Broker lokal: Redpanda (gambar kompatibel API Kafka, `kafkajs`), `PLAINTEXT://redpanda:9092` intra-compose, `OUTSIDE://localhost:9093` host.
- Partisi by key: order per pengantaran terjamin; order lintas pengantaran TIDAK dijamin.
- Semantics: at-least-once. `medical-ws` dedupe by `eventId` (TTL 15 menit); konsumen lain wajib dedupe `eventId`.
- Consumer group: `medical-ws-group` (gateway).
- Schema evolution: perubahan bersifat tambah field saja pada `v1`. Perubahan merusak = topic baru `v2`, konsumen migrasi bertahap. Tanpa registry: topic name adalah versi.
- Retensi: 7 hari. Alert: consumer lag > 1000 pesan atau > 60 detik.

> **Status implementasi (2026-10-30):** Redpanda tersedia di `simrs-dummy/compose.yaml`
> (profil `ws`); gateway `medical-ws` mengaktifkan Kafka, memproduksi event
> dari bridge HTTP ke `simrs.delivery.events.v1` (key `requestCode`) dan
> mengonsumsi topik yang sama untuk broadcast WS. Backend tetap mengirim HTTP
> `POST /internal/publish`; direct Kafka dari backend belum diimplementasi.
> SIMRS tidak menyentuh broker: pola SIMRS adalah outbox + relay webhook.

### 3.3 Enhancement setelah baseline

- Uji consumer lag, reconnect/resync, DLQ, duplikasi, ordering per `requestCode`, dan observability.
- Direct produce Kafka dari backend hanya dipertimbangkan jika disetujui bersama; harus ada alasan operasional, kontrak delivery, retry/idempotensi, dan rollback dari HTTP bridge.
- HMI/robot consumer dan topik robot menunggu kebutuhan, kontrak nyata, owner broker, serta persetujuan tim NEVO.
- Jangan membaca `simrs.robot.events.v1` sebelum integrasi NEVO nyata.

## 4. Aturan data yang bertahan di semua fase

1. Data sintetis, label `[MOCK]`/`SIMULATED` sampai integrasi nyata.
2. Tidak ada data klinis tambahan di event: pasien dibatasi mrn, fullName, gender, ruang/bed, isInfectious, diagnosis (sudah di snapshot), TANPA catatan medis lain.
3. `compartmentNo` hanya integer di payload arrival/handover, tidak pernah di read API.
4. Serah-terima hanya manusia. Tidak ada transisi otomatis `ARRIVED -> HANDOVER` dari mesin, di transport mana pun.
5. Jangan mengarang topic MQTT, ROS 2 topic, atau format WebSocket robot pada fase ini (AGENTS.md aturan 9).

## 5. Keamanan lintas transport

- Token di storage/env, tidak pernah di URL atau query param.
- Rotasi token: simpan dua nilai aktif (`current`, `previous`) agar rotate tanpa downtime.
- Webhook masuk: verifikasi `x-simrs-token` + IP allowlist bila memungkinkan; rate limit per token (mis. 60 req/menit).
- Log TIDAK mencatat token, hanya prefix 4 karakter untuk korelasi.
- Audit: setiap perubahan status tetap teraudit di SIMRS (`MONITORING_STATUS_CHANGE`) dan di monitoring (`actorId` layanan).

## 6. Uji terima untuk rekan (checklist)

WS:
1. Connect tanpa auth -> close `4401`.
2. Subscribe `all` -> menerima `SUBSCRIBED`.
3. Push webhook perubahan status -> update browser muncul < 1 detik.
4. Kirim webhook SAMA dua kali (eventId sama) -> update browser hanya sekali.
5. Matikan WS di tengah pengantaran -> reconnect -> resync -> tidak ada status yang tertinggal atau dobel.
6. Matikan server WS -> klien jatuh ke polling, update tetap tampil dalam 30 detik.

HTTP (kontras dengan final):
7. Token salah -> 401; semua layanan tetap jalan.
8. Retry `5xx` dengan idempotencyKey sama -> tidak ada event dobel di SIMRS (lihat 1.1).
9. Lapor `MOCK_HANDOVER_CONFIRMED` via API -> 422.
10. Fetch mapping tiap 30 detik -> ward/room/bed baru dari SIMRS muncul tanpa deploy ulang.

## 7. Keputusan yang masih harus disepakati bersama

1. URL callback webhook + skema token (2.2), ditulis sebelum work item SIMRS dibuat.
2. Kebutuhan latensi real yang men-trigger WS (2.1 poin 3), angkanya dari operator, bukan dari arsitek.
3. Host broker Kafka dan siapa yang mengoperasikannya (3.1 poin 4).
4. Apakah HMI ikut konsumsi Kafka sejak awal atau menyusul (mempengaruhi keputusan 3.1 poin 1).
5. Format `statusLabel` untuk fase nyata: label `REAL_*` apa yang dipakai setelah migrasi enum.

Perubahan dokumen ini harus disepakati bersama dan tercatat (AGENTS.md aturan 7), tidak boleh diubah diam-diam.
