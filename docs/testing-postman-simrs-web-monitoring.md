# Test Case Manual Postman — SIMRS ↔ Web Monitoring

Koleksi: `docs/postman-f2.postman_collection.json`. Variabel: `{{backend}}` (:8080), `{{bff}}` (:3000), `{{simrs}}` (:3001), `{{ws}}` (:8081).
Token/secret **tidak** ditulis di sini; ambil dari `.env` masing-masing komponen dan kirim via header.

Status kolom **Bukti**: `Maven` = tercakup tes otomatis (suite
`mvn -q test` = **33 tes, 0 gagal** per 1/11/2026; kelas:
`RobotCommandP1Test`, `RobotCommandRestP1Test`, `RobotRegistryRestP4Test`,
`SimrsClientServiceTest`, `MapGeneratorTest`, `PgmImageConverterTest`,
`RosCoordinateTransformTest`); `Live` = dijalankan manual terhadap
instance berjalan pada sesi 1/11/2026; `Unverified` = belum dijalankan
live.

> Semua hasil command robot di mode `ROBOT_MODE=sim` adalah SIMULATED. HTTP 202 bukan bukti ROS/Gazebo atau gerak robot fisik.

## Prasyarat
1. DB SIMRS (:5433) hidup; `cd simrs-dummy/medical-simrs-web && npm run wipe-demo && npm run seed-e2e` → `DELIV-YYYYMMDD-0001…0003`.
2. Jalankan: SIMRS (:3001), `medical-ws` (:8081, satu instance), backend (:8080), dashboard produksi (:3000).

## A. Command robot (backend)
| ID | Request | Ekspektasi | Bukti |
|---|---|---|---|
| A1 | `GET {{backend}}/robots` | 200, daftar robot memuat `NEVO-01` | Live (via BFF `/api/proxy/robots`, 1/11/2026) |
| A2 | `POST {{backend}}/robots/NEVO-01/commands` body `{"command":"CMD_RETURN_TO_DOCK"}` (robot idle) | 202 `{commandId, simulated:true}` | Maven |
| A3 | Sama dengan A2, robot sedang bertugas | `ROBOT_BUSY` (dock belum dikonfigurasi) | Maven |
| A4 | Body `{"command":"CMD_XYZ"}` atau tanpa `command` | 400 "command tidak dikenal" | Maven |
| A5 | `POST {{backend}}/robots/TIDAK-ADA/commands` | 404 "Robot tidak ditemukan" | Maven |
| A6 | `{"command":"CMD_CANCEL_MISSION"}` tanpa misi aktif | Ditolak/no-op, log WARN | Maven |
| A7 | `CMD_CANCEL_MISSION` saat misi aktif | Misi menjadi dibatalkan | **Unverified (tidak ada tes)** |
| A8 | `POST /missions` saat robot sibuk | Misi kedua `QUEUED` (bukan 409) | Unverified |
| A9 | `GET /missions`, `GET /missions/{id}`, `POST /missions/{id}/cancel` | Status konsisten dengan A7/A8 | Unverified |
| A10 | Request command tanpa kredensial (jika auth aktif) | Ditolak | **Unverified (auth REST belum diuji)** |

## B. Admin SIMRS (backend)
| ID | Request | Ekspektasi |
|---|---|---|
| B1 | `GET {{backend}}/simrs/admin/config` | 200, konfigurasi saat ini |
| B2 | `PATCH …/config` `{"pollIntervalSeconds":15}` | Hanya field itu berubah |
| B3 | `POST …/config` (ganti penuh) body: `enabled, writeEnabled, baseUrl, pollIntervalSeconds, connectTimeoutMs, readTimeoutMs, writeMaxAttempts` | Konfigurasi diganti penuh |
| B4 | `POST …/mission/reassign` `{"missionId":"<id QUEUED>","robotId":"NEVO-01"}` | Hanya misi `QUEUED` yang bisa di-reassign |
| B5 | Reassign misi non-`QUEUED` | Ditolak |
| B6 | `POST …/mission/reassign-batch` (array objek seperti B4) | Hasil per item |
| B7 | `GET /integrations/simrs/status` dan `/integrations/simrs/deliveries` | Setelah ±30 dtk, 3 `DELIV-…` muncul (jika token SIMRS valid) |

## C. Webhook monitoring → SIMRS
`POST {{simrs}}/api/v1/monitoring/delivery-status`, header `x-monitoring-token`. Body: `requestCode, toStatus, note, compartmentNo, idempotencyKey`.
| ID | Skenario | Ekspektasi |
|---|---|---|
| C1 | `PENDING_INTEGRATION → MOCK_IN_TRANSIT` | Diterima |
| C2 | `MOCK_IN_TRANSIT → MOCK_ARRIVED_AT_ROOM` dengan `compartmentNo` integer | Diterima |
| C3 | Arrival tanpa `compartmentNo` | Ditolak |
| C4 | Ulang `idempotencyKey` yang sama | Idempoten, tidak ada transisi ganda |
| C5 | Lompat transisi (mis. langsung ke arrival dari `PENDING_INTEGRATION`) | Ditolak |
| C6 | `toStatus: MOCK_HANDOVER_CONFIRMED` | Ditolak (hanya scan manusia) |
| C7 | Tanpa/token salah di header | Ditolak (401/403) |
| C8 | `compartmentNo` di read API SIMRS | Tidak pernah muncul |

## D. Gateway `medical-ws`
| ID | Skenario | Ekspektasi |
|---|---|---|
| D1 | `POST {{ws}}/internal/publish`, header `X-Internal-Secret`, body envelope `{v,eventId,type,occurredAt,requestCode,wardCode,data}` | `{"accepted":true}` |
| D2 | Publish tanpa/salah secret | Ditolak |
| D3 | WS `ws://127.0.0.1:8081/ws/v1/deliveries`, kirim SI | Terhubung sesuai `robot-ws-tifa.md` |
| D4 | Kirim STATUS | Di-enrich `robot_id`+`timestamp`, broadcast ke `robot:NEVO-01` |
| D5 | SI kedua dengan identitas sama | `ERROR DUPLICATE` lalu close 4002 |
| D6 | Channel valid: `all`, `ward:<code>`, `delivery:<requestCode>`, `robot:<robotId>` | Hanya subscriber channel terkait yang menerima |

## E. BFF relay (dashboard)
| ID | Request | Ekspektasi |
|---|---|---|
| E1 | `POST {{bff}}/api/ws/session` turnOn | Sesi ON | Live (1/11/2026) |
| E2 | `GET {{bff}}/api/ws/stream?channels=all` (SSE) | Stream terbuka; event D1 terlihat | Live (1/11/2026; `curl -N` → `sse.log`, exit 18 = koneksi ditutup bersama sesi — normal) |
| E3 | Lock/unlock sesi | Status sesi berubah sesuai | Unverified |
| E4 | turnOff, lalu `GET /api/ws/stream` | **409** |
| E5 | Browser tidak pernah memegang token WS | Token hanya di server (`.env.local`) |

## F. E2E (urut)
1. Seed SIMRS → tunggu poll → B7.
2. Dispatch misi (A8) → robot sim bergerak.
3. Webhook C1 → C2.
4. Cek D4/E2: event muncul di dashboard `/robots`.
5. Handover hanya via scan manusia.

Status E2E lintas komponen: **Live terverifikasi sesi 1/11/2026**
(SIMRS outbox+relay → bridge HTTP backend → Kafka `medical-ws` → broadcast
WS → BFF/SSE → dashboard; mode SIM). ROS/Gazebo/robot fisik: **BLOCKED**
(di luar lingkup lokal).

## G. Bukti live sesi 1/11/2026

### G1 — Registry robot (kontrak `robot-command.md` §7)

| # | Uji | Hasil |
|---|---|---|
| G1.1 | `curl POST /api/v1/robots` valid (registrasi curl sesi) | `201 {robotId, name, model}` |
| G1.2 | `POST /robots` duplikat (`robotId` sama) | `409` body `{status:409, message:"robotId sudah terdaftar"}` |
| G1.3 | `POST /robots` `model` kosong | `201`; model default DB `NEVO-A1` dibaca ulang |
| G1.4 | `POST /robots` payload melanggar aturan | `400` (pesan validasi) |
| G1.5 | `POST /robots` role OPERATOR | `403` |
| G1.6 | `GET /robots/registry` | `200` daftar `robotId,name,model,registeredAt` |
| G1.7 | Audit DB | 2 baris `h_mapping_audit` `operation=ROBOT_REGISTER` |

Catatan backend (1/11/2026): `server.error.include-message: always` di
`application.yml` — body `4xx` kini selalu memuat `message` (lihat §7
kontrak). Maven `mvn -q test` 33/0; jar + redeploy; `/actuator/health` UP.

Catatan pengeras error body (2/11/2026): semua body error disaring
`ApiErrorSanitizer` — pesan bisnis lolos apa adanya (G1.2 tetap
`"robotId sudah terdaftar"`), pesan internal Spring/JDK (`Access Denied`,
`Failed to convert value of type …`, `No static resource …`) menjadi
generik `"Permintaan gagal (HTTP <status>)"`. `mvn -q test` 45/0
(33 lama + 12 baru `ApiErrorSanitizerTest`); jar + redeploy + curl live:
409/400 bawaan bisnis lolos, 401/403, 404 statis, dan UUID salah
(`GET /api/v1/missions/abc`) kini generik. Menambah error baru =
tambah whitelist + tes; perubahan kontrak tercatat di `robot-command.md`
§7. Klien dashboard (`AppShell.tsx`) membaca `message` — fallback
generik ini aman ditampilkan.

### G2 — Halaman UI "Registrasi Robot" (`/robots/registry`, dashboard :3100)

1. Login admin → menu sidebar **Registrasi Robot**; tabel berisi
   NEVO-01, NEVO-TEST-04.
2. Form 3 field (ID Robot, Nama robot, Model opsional; validasi
   `pattern [A-Za-z0-9_.\-]`, robotId 3–64, name 1–150, model ≤100).
3. `POST` valid → `201` (network `POST /api/proxy/robots` 201); baris baru
   muncul, model default tampil, form tertutup + tabel refetch.
4. Submit duplikat → `409` + panel error **"robotId sudah terdaftar"**
   tampil, form tetap terbuka, tabel tidak berubah; flash auto-clear 4 dtk.
5. Regex textarea: `document.body.innerText.includes('sudah terdaftar')`
   → `FOUND` (1,2 s setelah submit) lalu `AUTO-CLEARED` (4,5 s).

### G3 — SSE E2E (dashboard :3100)

- Sesikan event via `/api/ws/session` (E1) lalu `GET /api/ws/stream`
  bertahan; `curl -N` merekam `sse.log` (exit 18 normal saat close).
- Dashboard `/robots` menerima update live (pemilih target, cancel).
