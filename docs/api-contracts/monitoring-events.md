# Kontrak Event SIMRS dengan Website Monitoring (fase mock)

> Status: **FINAL untuk fase mock** (HTTP polling + POST). Perubahan isi
> kontrak harus disepakati dan didokumentasikan lebih dulu (AGENTS.md
> aturan 7), bukan diubah diam-diam. WebSocket/Kafka tetap fase
> berikutnya sampai NEVO benar-benar terhubung; sampai saat itu semua
> perilaku simulasi memakai label `[MOCK]` dan blok `simulation: true`.

Satu sumber kebenaran label/tone/transisi status ada di
`simrs-dummy/medical-simrs-web/src/lib/delivery-status.ts`. Konsumen
monitoring WAJIB mencocokkan status lewat **kode** (`status`), bukan
label tampilan, karena label bisa berisi awalan `[MOCK]` dan bisa berubah.

## 1. Arah aliran data (mock)

```
SIMRS  --(polling snapshot + read API)-->  Website Monitoring
  pasien + ruang/bed + pengantaran yang berubah

Website Monitoring  --(POST status)-->  SIMRS
  status pengantaran obat
```

Fase mock memakai **HTTP polling + POST**, bukan WebSocket/Kafka
(AGENTS.md aturan 9: dilarang di fase awal).

## 2. Auth

- Header wajib: `x-monitoring-token: <MONITORING_TOKEN>`
- Tanpa token valid: `401`. Token belum di-set di server: `503` (fail-closed).
- Perubahan status dari monitoring diaudit atas akun layanan
  `monitoring_service` (aksi `MONITORING_STATUS_CHANGE`).

## 3. SIMRS melempar data (snapshot)

`GET /api/v1/monitoring/snapshot?since=ISO-8601&limit=200`

- `since` opsional (default: 24 jam terakhir), `limit` maks 200.
- `patients`: HANYA yang masih dirawat (`dischargedAt` null DAN punya
  `roomCode`) dan `updatedAt > since` → id, mrn, fullName, gender,
  roomCode, diagnosis, isInfectious, updatedAt. Pasien selesai rawat
  (riwayat) TIDAK dilempar.
- Kolom `isInfectious: true` = **ALERT infeksi** (pasien penyakit
  menular → terapkan kewaspadaan transmisi kontak/droplet/airborne).
  Monitoring wajib menampilkannya sebagai alert.
- `deliveries`: yang `updatedAt > since` → id, requestCode, status, roomCode,
  notes, requestedAt, updatedAt + prescription { code, patient { mrn, fullName } }.
- `rooms`: SELALU full (dataset kecil) → roomCode, name, ward { code, name },
  beds[] { bedNumber, isOccupied }.
- Room tidak punya `updatedAt` di skema, jadi tidak difilter `since`.

## 4. Monitoring melempar status

`POST /api/v1/monitoring/delivery-status`

Body:

```json
{
  "requestCode": "DELIV-20261014-0001",
  "toStatus": "MOCK_IN_TRANSIT",
  "note": "Robot berangkat dari farmasi",
  "compartmentNo": 2,
  "idempotencyKey": "nevomock-deliv-0001-step2"
}
```

- `toStatus` valid: `DELIVERY_REQUESTED, PENDING_INTEGRATION,
  MOCK_IN_TRANSIT, MOCK_ARRIVED_AT_ROOM, MOCK_HANDOVER_CONFIRMED, CANCELLED`.
- `MOCK_HANDOVER_CONFIRMED` HANYA dari halaman scan `/scan/[mrn]` oleh
  manusia yang login (server action `confirmHandoverAction`). Monitoring
  yang melempar status ini mendapat `422` (edge itu tidak ada di
  `MONITORING_TRANSITIONS`; tabel diturunkan dari
  `DELIVERY_TRANSITIONS` di lib dengan menyaring edge serah-terima).
- `compartmentNo` opsional, bilangan bulat `>= 0`. Pemetaan
  requestCode ke kompartemen milik robot; SIMRS hanya menyimpannya di
  payload event `MOCK_ARRIVED_AT_ROOM` supaya halaman scan tahu
  kompartemen mana yang harus dibuka. Selain nilai itu: `400`. Tidak
  ada endpoint SIMRS yang me-return `compartmentNo`.
- Transisi yang boleh dilempar monitoring (cermin tabel lib, minus
  edge serah-terima):
  - `DELIVERY_REQUESTED` ke `PENDING_INTEGRATION, CANCELLED`
  - `PENDING_INTEGRATION` ke `MOCK_IN_TRANSIT, CANCELLED`
  - `MOCK_IN_TRANSIT` ke `MOCK_ARRIVED_AT_ROOM, CANCELLED`
  - `MOCK_ARRIVED_AT_ROOM` ke daftar kosong (lemparan apa pun → `422`)

### 4.1 Idempotency

`idempotencyKey` opsional, string 1-64 karakter dari
`[A-Za-z0-9._:-]` (regex `^[A-Za-z0-9._:-]{1,64}$`). Pola melanggar →
`400`; `null`/tidak dikirim berarti tidak memakai dedupe.

- Key disimpan unik di kolom `delivery_events.idempotency_key` dan
  HANYA diproduksi endpoint ini.
- **Replay**: key sudah pernah dipakai DENGAN kombinasi `requestCode`
  + `toStatus` yang sama → SIMRS membalas hasil request pertama
  (`200`) tanpa membuat event/transisi baru:

  ```json
  { "success": true, "duplicate": true, "requestCode": "...", "from": "...", "to": "..." }
  ```

- Key sudah dipakai untuk kombinasi BERBEDA (mis. lapor tiba padahal
  dipakai lapor berangkat) → `409` dengan
  `idempotencyKeyUsedFor: { requestCode, toStatus }`.
- Dua request yang tiba bersamaan akan diselesaikan oleh constraint
  unique: yang menang eksekusi, yang kalah dicarikan event pertamanya
  dan dibalas `duplicate: true` bila `statusAfter`-nya sama (aman
  untuk retry yang terjadi bertabrakan).

### 4.2 Kode respons

- `400`: body bukan JSON, field wajib salah, `toStatus` tidak dikenal,
  `idempotencyKey` salah pola, `compartmentNo` bukan bilangan bulat `>= 0`.
- `404`: `requestCode` tidak ditemukan.
- `409`: `idempotencyKey` dipakai untuk kombinasi lain.
- `422`: transisi tidak diperbolehkan (termasuk lemparan ke
  `MOCK_HANDOVER_CONFIRMED`).
- `503`: akun layanan `monitoring_service` belum di-seed.
- `401`/`503` auth sesuai bagian 2.

### 4.3 Efek dan respons sukses pertama

Transaksi: update `deliveryRequest.status` + `deliveryEvent`
(`isSimulation` ikut status `[MOCK]`, `actorId` null, payload
`{ source: "monitoring" }`, plus `compartmentNo` bila lapor tiba) +
`auditLog`. Setelah itu halaman pengantaran/dashboard di-revalidate.

```json
{
  "success": true,
  "duplicate": false,
  "requestCode": "DELIV-20261014-0001",
  "from": "PENDING_INTEGRATION",
  "to": "MOCK_IN_TRANSIT",
  "idempotencyKey": "nevomock-deliv-0001-step2"
}
```

### 4.4 Konfirmasi serah-terima (alur manusia)

Scan QR pasien membuka `/scan/[mrn]` (butuh sesi login). Halaman
menampilkan identitas pasien, ruang/bed, nomor kompartemen, dan daftar
obat dari database live. Satu klik tombol konfirmasi mengubah
`MOCK_ARRIVED_AT_ROOM` menjadi `MOCK_HANDOVER_CONFIRMED` + event
`HANDOVER_CONFIRMED` (`{ patientMrn, compartmentNo, method: "QR_SCAN" }`)
+ audit. Robot TIDAK BISA mengklaim serah-terima dengan sendirinya.

Contoh uji:

```bash
curl -s -X POST http://localhost:3000/api/v1/monitoring/delivery-status \
  -H "Content-Type: application/json" \
  -H "x-monitoring-token: $MONITORING_TOKEN" \
  -d '{"requestCode":"DELIV-20261014-0001","toStatus":"MOCK_IN_TRANSIT","note":"Robot berangkat","idempotencyKey":"nevomock-deliv-0001-step2"}'
```

Ulangi curl yang sama persis: responsnya tetap `200` dengan
`duplicate: true` (idempotent), bukan event kedua.

## 5. Read API (konsumen non-manusia)

Dua endpoint read untuk antrian/lookup di sisi monitoring. Keduanya
TIDAK menyertakan `compartmentNo` dan TIDAK memuat data klinis selain
yang sudah disebut.

### 5.1 Cek pasien per nomor rekam medis

`GET /api/v1/monitoring/patient/SYN-MRN-0001`

- `404` bila nomor tidak ditemukan.
- Info ruang penuh lewat bed pasien (`wardCode/wardName/roomName/
  bedNumber`; `null` bila pasien belum duduk di bed).
- `active` = belum `dischargedAt` DAN punya `roomCode` (aturan sama
  dengan filter snapshot).
- `activeDeliveries` berisi pengantaran yang masih berjalan untuk
  pasien tersebut, terbaru dulu, lengkap dengan `statusLabel`
  (label ber-prefix `[MOCK]` untuk kode simulasi).

```json
{
  "patient": {
    "mrn": "SYN-MRN-0001", "fullName": "...", "gender": "L",
    "dateOfBirth": "1978-04-12T00:00:00.000Z", "diagnosis": "...",
    "isInfectious": false, "isSynthetic": true,
    "roomCode": "R301", "roomName": "Ruang 301", "wardCode": "A",
    "wardName": "Bangsal A", "bedNumber": 3,
    "active": true, "dischargedAt": null
  },
  "activeDeliveries": [
    { "id": "...", "requestCode": "DELIV-...", "status": "MOCK_IN_TRANSIT",
      "statusLabel": "[MOCK] Transit", "roomCode": "R301", "roomName": "Ruang 301",
      "prescriptionCode": "RX-...", "requestedAt": "...", "updatedAt": "..." }
  ]
}
```

### 5.2 Antrian pengantaran berjalan

`GET /api/v1/monitoring/active-deliveries?limit=100`

- `limit` default 100, maks disitekan 200; bukan bilangan bulat `>= 1` → `400`.
- Respons: `{ generatedAt, count, deliveries: [...] }`, terbaru dulu.
- `roomCode`/`roomName` di level item = **ruang tujuan** pengantaran;
  `patient.roomCode` dst. = ruang/bed tempat pasien saat ini (bisa beda
  bila pasien pindah bed antara request dan tiba).

```json
{
  "generatedAt": "2026-10-18T09:00:00.000Z",
  "count": 1,
  "deliveries": [
    { "id": "...", "requestCode": "DELIV-...", "status": "MOCK_IN_TRANSIT",
      "statusLabel": "[MOCK] Transit", "roomCode": "R301", "roomName": "Ruang 301",
      "prescriptionCode": "RX-...",
      "patient": { "mrn": "SYN-MRN-0001", "fullName": "...", "gender": "L",
                   "roomCode": "R301", "roomName": "Ruang 301", "wardCode": "A",
                   "wardName": "Bangsal A", "bedNumber": 3, "dischargedAt": null },
      "requestedAt": "...", "updatedAt": "..." }
  ]
}
```

## 6. Mapping sinkronisasi (YAML)

`GET /api/v1/monitoring/mapping` (header token sama) me-return YAML yang
di-generate LIVE dari database: daftar bangsal + ruang + bed, peta status
delivery/resep (label + severity + flag `simulation`), pola `roomCode`,
dan endpoint polling.

Website monitoring WAJIB fetch ulang endpoint ini secara berkala
(rekomendasi tiap 30 detik atau saat boot) agar otomatis sinkron:
bangsal/ruang/bed baru dari SIMRS langsung ikut tanpa edit file manual.
Label dan daftar status menurut `lib/delivery-status.ts`; sekarang label
kode `MOCK_*` memuat awalan `[MOCK]`. Cocokkan status lewat kode,
bukan label. Salinan contoh (bukan sumber kebenaran):
`medical-dashboard-monitoring/simrs-mapping.yaml`.

## 7. Yang belum diputuskan (fase berikutnya)

- Status robot `REAL_*` (butuh migrasi enum `DeliveryStatus`). Sampai
  NEVO terhubung sungguhan, semua status gerak tetap `MOCK_*`.
- WebSocket gateway (`websocket-gateway/`) dan topic Kafka.
- Retry/backoff di sisi monitoring (idempotency di sisi SIMRS sudah ada;
  kebijakan retry sisi pengirim masih keputusan fase berikutnya).
