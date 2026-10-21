# Kontrak Integrasi: SIMRS Dummy ke Web Monitoring (API + WebSocket + Kafka)

> Status: **DRAF** untuk fase integrasi. BAGIAN 1 (HTTP) sudah **FINAL
> untuk fase mock** dan detail lengkapnya ada di
> `docs/api-contracts/monitoring-events.md`; dokumen ini TIDAK mengulang
> detail itu, hanya meringkasnya sebagai acuan. BAGIAN 2 (WebSocket) dan
> BAGIAN 3 (Kafka) masih **draf** dan dilarang diimplementasi sebelum
> trigger conditions di masing-masing bagian terpenuhi
> (AGENTS.md aturan 2 dan 9).
>
> Sumber kebenaran label/tone/transisi status:
> `simrs-dummy/medical-simrs-web/src/lib/delivery-status.ts`.

## 0. Pihak dan komponen

| Komponen | Folder | Status sekarang | Peran |
|---|---|---|---|
| SIMRS Dummy (Next.js) | `simrs-dummy/medical-simrs-web/` | Hidup, demo via Cloudflare Tunnel | Sumber data pengantaran, status, pasien |
| Web Monitoring (dashboard) | `medical-dashboard-monitoring/` | Dibangun oleh rekan | Konsumen status untuk staf; pengelola WebSocket ke browser |
| HMI robot | `medical-hmi/` | Placeholder | Pengelola kompartemen robot, fase jauh |
| Robot NEVO | `robot/` | Belum terhubung | Produsen event gerak, fase jauh |
| websocket-gateway | `websocket-gateway/` | Placeholder kosong | Dilarang diisi sebelum keputusan BAGIAN 2/3 |

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
6. QR wristband berisi HANYA `{base}/scan/{mrn}`. Tanpa data klinis di QR.
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

## 2. Bagian WebSocket (DRAF; jangan bangun dulu)

### 2.1 Trigger untuk mulai

Semua harus terpenuhi:

1. HTTP di BAGIAN 1 sudah teruji end to end dengan alur nyata (SAAT INI SUDAH).
2. Web monitoring sudah jadi minimal viable (dashboard baca, halaman pengantaran aktif).
3. Ada kebutuhan nyata yang diukur: jeda polling 30 detik dirasa mengganggu operator, atau scan page butuh update < 1 detik.
4. Keputusan arsitektur: SIAPA yang menjalankan WebSocket. Jawaban rekomendasi: **web monitoring**, BUKAN SIMRS.

### 2.2 Arsitektur disepakati

SIMRS Dummy TIDAK akan pernah menjalankan WebSocket. Aliran data:

```
SIMRS  --(webhook HTTP POST, opsional)-->  Web Monitoring  --(WebSocket)-->  Browser/HMI
SIMRS  --(polling snapshot, fallback)-->   Web Monitoring
```

- Web monitoring menerima push dari SIMRS lalu menyebar ke klien browser lewat WS sendiri.
- Karena itu SIMRS nanti butuh SATU tambahan kecil: webhook keluar. Work item SIMRS: `POST {MONITORING_CALLBACK_URL}/webhooks/simrs` dengan header `x-simrs-token`, body = Envelope (2.4), retry policy sama dengan 1.1. Sampai work item ini dibuat, monitoring tetap polling snapshot: polling tetap kontrak final dan cukup.

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

### 2.5 Yang dibangun rekan

- Server WS di `medical-dashboard-monitoring/` dengan auth handshake di atas.
- Receiver webhook `POST /webhooks/simrs` (validasi token, dedupe `eventId`, simpan ke DB monitoring, broadcast).
- Poller fallback yang memakai BAGIAN 1 apa adanya.
- Tidak menyentuh SIMRS: kontrak SIMRS tidak berubah oleh WS.

## 3. Bagian Kafka (DRAF; jangan bangun dulu)

### 3.1 Trigger untuk mulai

Semua harus terpenuhi:

1. Minimal 2 konsumen nyata membutuhkan event yang sama (mis. dashboard monitoring + HMI, atau monitoring + integrator NEVO).
2. Integrasi NEVO/SIMRS nyata sudah dikontrak (bukan `MOCK`), karena topology topic harus memuat event robot `REAL_*` juga.
3. Ada target latensi tertulis (mis. p95 < 5 detik) yang polling tidak bisa capai.
4. Ada tim/jaringan yang benar-benar menjalankan broker (setidaknya 1 broker lab, 3 broker produksi).

Jika salah satu gagal, jawabannya TETAP webhook + polling dari BAGIAN 1/2.

### 3.2 Topology yang diusulkan

| Topik | Produsen | Key pesan | Catatan |
|---|---|---|---|
| `simrs.delivery.events.v1` | SIMRS | `requestCode` | Semua tipe event Envelope di 2.3 |
| `simrs.robot.events.v1` | NEVO/integrator | `requestCode` | Fase nyata saja; status `REAL_*` setelah migrasi enum |
| `simrs.delivery.events.dlq` | relay | `requestCode` | Pesan gagal format/dedupe |

- Partisi by key: order per pengantaran terjamin; order lintas pengantaran TIDAK dijamin.
- Semantics: at-least-once. Konsumen dedupe by `eventId` (kolom unique + TTL atau tabel processed_events).
- Produksi: gunakan pola **outbox** di SIMRS. Event ditulis ke tabel outbox dalam transaksi yang sama dengan perubahan status, lalu relay terpisah mengpublish. Ini menghindari dual-write di mana DB sudah commit tapi Kafka gagal.
- Schema evolution: perubahan bersifat tambah field saja pada `v1`. Perubahan merusak = topic baru `v2`, konsumen migrasi bertahap. Tanpa registry: topic name adalah versi.
- Retensi: 7 hari. Consumer group: `<consumer-name>` (dashboard, hmi, integrator).
- Alert: consumer lag > 1000 pesan atau > 60 detik.
- Setelah semua konsumen pindah ke Kafka, webhook dari BAGIAN 2.2 dimatikan. Selama migrasi, keduanya boleh hidup bersamaan karena dedupe by `eventId`.

### 3.3 Yang dibangun rekan (bila trigger terpenuhi)

- Consumer group dashboard, handler envelope + dedupe, fallback ke read API saat gap.
- DLQ reader + alarm.
- Tidak boleh membaca topik `simrs.robot.events.v1` sebelum NEVO nyata.

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
