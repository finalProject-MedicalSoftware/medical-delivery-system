# Kontrak data SIMRS → backend / dashboard / HMI

Status: **aditif** (hanya menambah field; tidak ada field yang dihapus atau diubah artinya). Konsumen lama tetap jalan. Auth semua endpoint: header `x-monitoring-token`.

## Konsumen & kebutuhan
| Konsumen | Ambil dari | Untuk |
|---|---|---|
| Backend (`SimrsClientService`) | `snapshot`, `active-deliveries`, webhook outbox | cache antrean, nama obat di misi |
| Dashboard monitoring | backend (BFF), SSE `/monitoring/stream` | status realtime |
| HMI robot | `patient/{mrn}`, `active-deliveries`, SSE | panduan serah-terima (kompartemen dulu, lalu obat + aturan pakai) |

## ATURAN PENTING: kapan data masuk ke monitoring
Pengantaran **baru terlihat oleh monitoring/robot/HMI setelah petugas SIMRS menekan "Kirim ke Robot"** (`DELIVERY_REQUESTED → PENDING_INTEGRATION`). Sebelum itu data hanya ada di SIMRS:
- Tidak muncul di `active-deliveries`, `snapshot.deliveries`, `patient/{mrn}.activeDeliveries`, dan SSE `/monitoring/stream`.
- Tidak ada event outbox/webhook saat pengantaran dibuat. Event pertama yang diterima backend adalah `DELIVERY_CREATED` (`from: DELIVERY_REQUESTED`, `to: PENDING_INTEGRATION`) saat dikirim ke robot.
- Pembatalan sebelum dikirim tidak menerbitkan event.
- `POST /monitoring/delivery-status` ke pengantaran yang belum dikirim ditolak 422 (keputusan kirim ada di petugas SIMRS).
- Status `DELIVERY_REQUESTED` kini tidak pernah terlihat oleh konsumen. Konsumen yang menganggap `DELIVERY_REQUESTED` sebagai status awal perlu menyesuaikan: status pertama yang terlihat adalah `PENDING_INTEGRATION`.

## Aturan pasien menular
Pengantaran robot utamanya untuk pasien yang di-ALERT menular (`patient.isInfectious`). Pasien **tidak menular tetap bisa** diajukan, tetapi petugas wajib mengisi alasan; alasan dikirim di `robotReason` (null untuk pasien menular). Konsumen dapat menampilkan `robotReason` pada misi.

## Perubahan (Tahap 1–2)

### 1. `items[]` pada pengantaran — BARU
Ditambahkan di `GET /api/v1/monitoring/active-deliveries` (`deliveries[].items`), `GET /api/v1/monitoring/snapshot` (`deliveries[].prescription.items`), dan `GET /api/v1/monitoring/patient/{mrn}` (`activeDeliveries[].items`).

```json
"items": [
  {
    "medicineCode": "MED-PCM-500",
    "name": "Paracetamol 500 mg",
    "category": "Analgesik",
    "quantity": 10,
    "unit": "tablet",
    "instructions": "3x1 tablet sesudah makan"
  }
]
```
Array kosong bila resep tak punya item. Backend: `SimrsClientService` sudah membaca `prescription.items[].medicine.name` / `items[].name`, jadi `medicineName` kini terisi tanpa perubahan kode (verifikasi oleh rekan backend).

### 1b. Prioritas, alergi, penanganan khusus — BARU (aditif)
| Field | Lokasi | Nilai |
|---|---|---|
| `robotReason` | `active-deliveries` `deliveries[]` | `string \| null` — alasan pengantaran robot untuk pasien tidak menular |
| `priority` | `active-deliveries` `deliveries[]`; `snapshot` `deliveries[].prescription`; `patient/{mrn}` `activeDeliveries[]` | `ROUTINE` \| `URGENT` \| `STAT` |
| `allergies` | `active-deliveries` `deliveries[].patient`; `snapshot` `patients[]`; `patient/{mrn}` `patient` | `string[]` (teks bebas, bisa kosong) |
| `handling` | setiap elemen `items[]` | `NONE` \| `COLD_CHAIN` \| `CONTROLLED` \| `HIGH_ALERT` |

Saran perilaku robot/HMI: tampilkan `STAT`/`URGENT` lebih dulu di antrean; `COLD_CHAIN`/`CONTROLLED` wajib ditandai pada panduan serah-terima; tampilkan `allergies` saat verifikasi identitas pasien. Keputusan klinis tetap di SIMRS/manusia.

### 1c. Aturan pakai terstruktur `items[].dose` — BARU (aditif)
```json
"dose": { "amount": 0.5, "unit": "tablet", "timesPerDay": 3, "mealTiming": "AFTER_MEAL",
          "durationDays": 5, "route": "CHEW", "note": "bila demam" }
```
`mealTiming`: `ANYTIME` | `BEFORE_MEAL` | `AFTER_MEAL` | `WITH_MEAL`. `route`: `ORAL` | `CHEW` | `DISSOLVE` | `DROPS` | `TOPICAL` | `INHALE` | `INJECTION`. `amount` boleh pecahan (0,25 / 0,5 / 0,75 / 1,5 ...). `durationDays` dan `note` boleh `null`. `dose` bernilai **`null` pada resep lama** (sebelum perubahan ini): konsumen wajib jatuh kembali ke teks `instructions`. `instructions` tetap ada dan kini dibuat otomatis dari field terstruktur (contoh: "Minum 1 tablet, 3 kali sehari, sesudah makan, selama 5 hari.").

### 2. `actor` pada event outbox/webhook — BARU (opsional)
`data.actor` = username petugas yang melakukan transisi (manusia yang login). Tidak ada untuk transisi yang dilempar monitoring (`delivery-status`). Envelope tetap `v:1`; konsumen yang tidak mengenalnya mengabaikan.

### 3. Tidak berubah
`compartmentNo` tetap hanya di payload event arrival/handover.

## Rename status wire (diterapkan)
`MOCK_IN_TRANSIT`→`IN_TRANSIT`, `MOCK_ARRIVED_AT_ROOM`→`ARRIVED_AT_ROOM`, `MOCK_HANDOVER_CONFIRMED`→`HANDOVER_CONFIRMED`. Semua respons, event SSE, dan payload outbox/webhook memakai nama baru; `POST /monitoring/delivery-status` masih menerima nama lama pada input. Field `simulation`/`simulationLabel` dihapus. Penerapan harus serentak (SIMRS + backend + dashboard).

## Pasien yang "dipanggil" monitoring
`GET /api/v1/monitoring/patients?deliveryReady=true` hanya mengembalikan pasien yang punya pengantaran yang **sudah dikirim ke robot**. Tiap pasien membawa `robotEligible` (ada pengantaran terkirim DAN (menular ATAU petugas menulis alasan)), `robotReason`, dan `activeDeliveries[{requestCode,status}]`. `GET /monitoring/patient/{mrn}` membawa `robotEligible`/`robotReason` pada objek `patient`. Backend (`getPatients`, `MissionPlanningService`) dan dashboard (`/missions/create`) memakai `robotEligible`, bukan `isInfectious`, sebagai syarat pembuatan misi. Parameter lama `infectiousOnly` tetap ada.

## Status baru `NOT_COLLECTED` (obat tidak diambil)
Dilaporkan backend/robot saat `ARRIVED_AT_ROOM` dan pasien tidak mengambil obat sampai batas waktu (robot membawa obat kembali). `POST /monitoring/delivery-status` `{toStatus:"NOT_COLLECTED"}` hanya sah dari `ARRIVED_AT_ROOM`; status **terminal** (tidak ada transisi keluar, tidak termasuk "aktif", tetap terlihat monitoring). SIMRS menampilkan peringatan di dashboard ("Obat tidak diambil pasien") sampai perawat menekan **Sudah ditindaklanjuti**; resep dapat diajukan ulang untuk pengantaran baru. Alur backend: robot `PICKUP_CONFIRM {sequence, method:"TIMEOUT", collected:false}` → gateway → `POST /internal/robot-events` → SIMRS `NOT_COLLECTED` (idempotencyKey `m:<missionId>:NOT_COLLECTED`).

## Perilaku SIMRS yang berdampak pada konsumen
- Pasien **tidak bisa dipindah ruang** saat punya pengantaran aktif (status DELIVERY_REQUESTED/PENDING_INTEGRATION/IN_TRANSIT/ARRIVED_AT_ROOM). Tujuan pengantaran karenanya tidak berubah di tengah jalan; pindah ruang baru diizinkan setelah serah-terima atau pembatalan.
- Stok obat berkurang saat resep `PREPARING → READY_FOR_DELIVERY` (ditolak bila stok kurang) dan tercatat di riwayat stok.
- Resep dengan obat yang cocok dengan alergi pasien butuh pernyataan risiko dokter (server menolak tanpa itu).
- Halaman `/integrasi` (admin) menampilkan antrean outbox (PENDING/SENT/DEAD) dan tombol kirim ulang untuk DEAD.

## Endpoint/halaman baru (internal SIMRS, bukan kontrak konsumen luar)
`GET /api/laporan?days=7|30|90` (CSV), `GET /api/audit?entityType=` (CSV), halaman `/laporan`, `/obat/{id}/riwayat`, `/pengantaran/{id}/berita-acara`.

## Migrasi database
`prisma/migrations/20261118000000_clinical_priority_allergy_stock` (enum `Priority`, `Handling`; kolom `m_patient.allergies`, `t_prescription.priority`, `m_medicine.min_stock/handling`; tabel `h_stock_movement`). Container `simrs-web` kini menjalankan `prisma migrate deploy` saat start.
