# Kontrak jembatan event internal (backend → medical-ws → klien)

> Status: **FINAL untuk fase mock**. Menggantikan Kafka sebagai sumber
> event WebSocket selama fase mock. Perubahan isi kontrak = diskusi dan
> tercatat lebih dulu (AGENTS.md aturan 6), bukan diubah diam-diam.

## 1. Arah aliran

```
medical-backend  --POST /internal/publish (envelope, X-Internal-Secret)-->  medical-ws
                                                                              |
                                                        +---------------------+---------------------+
                                                        v                                           v
                                            browser dashboard (WS)                    HMI robot (WS)
```

Backend tidak lagi menjadi sumber WebSocket langsung untuk konsumen luar;
`medical-ws` yang memegang koneksi klien. Backend tetap membuka
`ws://<host>:8080/ws/robot` untuk kompatibilitas (dashboard lama), tetapi
jalur yang direkomendasikan adalah `medical-ws`.

Kafka **ditunda**, bukan dibatalkan. Titik tukar ada di satu berkas
(`medical-ws/src/ws/server.js`): `handlePublish()` diganti consumer Kafka
yang memanggil `handleEnvelope()` yang sama. Tidak ada rework di backend.

## 2. Endpoint

`POST /internal/publish` pada `medical-ws` (default `:8081`).

Header wajib: `X-Internal-Secret: <INTERNAL_PUBLISH_SECRET>`
Header opsional: `Content-Type: application/json`

Perbandingan secret memakai perbandingan waktu-konstan
(`crypto.timingSafeEqual` dengan cek panjang lebih dulu). Bila
`INTERNAL_PUBLISH_SECRET` kosong, **semua** permintaan ditolak `401` —
tidak ada mode "terbuka".

Batas ukuran body: `INTERNAL_PUBLISH_MAX_BYTES` (default `65536`).
Autentikasi diperiksa **sebelum** body dibaca.

### 2.1 Body (envelope)

```json
{
  "v": 1,
  "eventId": "b1f0c2c4-2f6a-4b0e-9c1d-6a0f2c9d51aa",
  "type": "MISSION_EVENT",
  "occurredAt": "2026-10-23T04:15:00.000Z",
  "requestCode": "DELIV-20261023-0007",
  "wardCode": "A",
  "data": { "status": "EXECUTING", "message": "robot menuju R301" }
}
```

| Field | Aturan |
|---|---|
| `v` | wajib `1` |
| `eventId` | string tidak kosong, dipakai dedupe (`dedupe.seen`) |
| `type` | string tidak kosong; fase ini hanya `MISSION_EVENT` |
| `occurredAt` | string tidak kosong (ISO-8601) |
| `requestCode` | string tidak kosong — sekaligus kunci kanal `delivery:<code>` |
| `wardCode` | string tidak kosong — kunci kanal `ward:<code>` |
| `data` | object non-null |

Envelope yang tidak memenuhi tabel di atas → `400 INVALID_ENVELOPE`.

### 2.2 Field routing

- `requestCode` = kode pengantaran (`t_mission.request_code`).
- `wardCode` = bangsal tujuan, dibaca dari
  `m_simrs_room_directory.ward_code` berdasarkan `roomCode` misi.
- Saat SIMRS nonaktif (fase mock) direktori ruang kosong, jadi backend
  memakai `roomCode` sebagai nilai `wardCode` (fallback non-null) supaya
  event tetap tersalurkan. Dashboard belum berlangganan kanal, jadi
  fallback ini tidak memecah konsumen mana pun.

## 3. Yang dikirim backend (fase ini)

Hanya `MISSION_EVENT`, dan hanya bila `requestCode` **dan** `wardCode`
tersedia. `TELEMETRY` tidak membawa kedua field itu → otomatis tidak
dipublikasikan, tanpa perlu whitelist tipe.

Kode status yang muncul: `EXECUTING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.
Bentuk `data` identik dengan payload yang di-broadcast backend ke
`ws://<host>:8080/ws/robot` (lihat `SimulatedRobotService`), termasuk
`missionId`, `requestCode`, `wardCode`, `roomCode`, `compartmentNo`
(hanya pada event arrival/handover), `status`, `message`.

## 4. Respons

| Kondisi | Status | Body |
|---|---|---|
| diterima & di-broadcast | `202` | `{"accepted":true}` |
| `eventId` sudah pernah dilihat | `400` | `{"error":"DUPLICATE"}` |
| JSON tidak valid | `400` | `{"error":"INVALID_JSON"}` |
| envelope tidak valid | `400` | `{"error":"INVALID_ENVELOPE"}` |
| secret salah/kosong | `401` | `{"error":"UNAUTHORIZED"}` |
| body melebihi batas | `413` | `{"error":"BODY_TOO_LARGE"}` |
| galat tak terduga | `500` | `{"error":"INTERNAL_ERROR"}` |

`202` berarti event sudah diserahkan ke kanal, **bukan** jaminan klien
menerimanya (klien yang sedang offline tidak mendapat replay).

## 5. Konfigurasi

Backend (`application.yml`, semua bisa dioverride env):

```yaml
nevo:
  internal-publish:
    url: ${INTERNAL_PUBLISH_URL:http://localhost:8081/internal/publish}
    secret: ${INTERNAL_PUBLISH_SECRET:}
```

`medical-ws` (`.env`): `INTERNAL_PUBLISH_SECRET`,
`INTERNAL_PUBLISH_MAX_BYTES`.

Secret kosong di backend → publish dilewati (tidak ada request keluar),
sehingga mode dev tanpa `medical-ws` tetap bersih tanpa error log.

## 6. Yang ditunda

- **Prefiks tenant pada kanal** (`company:<id>:ward:<code>`). Belum ada
  kolom `company` di skema mana pun dan fase mock masih single-tenant.
  Implementasi menyusul bersama fase `m_company`; sampai saat itu kanal
  tetap `all` / `ward:<code>` / `delivery:<code>`.
- **Kafka + outbox/relay**: pengganti jalur ini saat produksi.
- **Replay/backlog**: `medical-ws` tidak menyimpan event; klien yang
  terputus kehilangan event selama terputus.
