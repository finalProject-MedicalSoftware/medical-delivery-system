# Medical Delivery System

Prototipe pengantaran obat dari farmasi ke bangsal dengan bantuan robot, memakai **data sintetis**.
Bukan sistem klinis dan bukan robot fisik: label `[MOCK]`/`SIMULATED` ditulis oleh kode.

Rantai datanya:

```
SIMRS Dummy ──(outbox + relay webhook)──> medical-backend ──(POST /internal/publish)──> medical-ws ──(WS/SSE)──> dashboard
      ▲                                        │
      └──────────(POST status robot via x-monitoring-token)──────────┘
```

Kebenaran kontrak ada di `docs/api-contracts/` (bukan di README ini, bukan di dokumen historis).

## Isi repo

| Folder | Isi | Repo git |
|---|---|---|
| `simrs-dummy/medical-simrs-web` | SIMRS dummy (Next.js + Prisma). Punya outbox+relay webhook; **tidak** menyentuh Kafka | sendiri |
| `medical-backend/` | Spring Boot: REST, SimulatedRobotService, polling SIMRS, bridge publish | sendiri |
| `medical-ws/` | Gateway WebSocket: bridge HTTP + (opsional) Kafka → WS | sendiri |
| `medical-dashboard-monitoring/frontend` | Web monitoring (Next.js + BFF/SSE) | rekan |
| `medical-hmi/` | HMI robot (belum dimulai) | — |
| `docs/` | Kontrak, status, checklist uji | — |

## Prasyarat

- Node.js **20+** (SIMRS, dashboard, medical-ws)
- JDK **21** + Maven (backend), atau cukup Docker
- Docker Desktop (PostgreSQL; opsional untuk semua service)
- PostgreSQL **17**; tiap service punya database sendiri

## Peta port (default lokal)

| Service | Port host | Env pengatur |
|---|---|---|
| SIMRS web | `3000` | `SIMRS_WEB_PORT` |
| PostgreSQL SIMRS | `5433` | tetap |
| PostgreSQL medical | `5434` | tetap |
| medical-backend | **`8082`** → kontainer `8080` | `MEDICAL_BACKEND_PORT`, `SERVER_PORT` |
| medical-ws | **`8083`** → kontainer `8081` | `MEDICAL_WS_PORT`, `WS_PORT` |
| Redpanda (Kafka) | `9093` | tetap |
| Dashboard (dev) | `3100` (`next dev -p 3100`) | — |

`8082`/`8083` dipakai di host supaya tidak bentrok dengan layanan lain di `8080`/`8081`.

## Jalankan dengan Docker Compose (cara tercepat)

```bash
cd simrs-dummy
cp .env.example .env          # isi password & secret unik, jangan commit
docker compose up -d --build                          # hanya 2 PostgreSQL
docker compose --profile apps up -d --build           # + SIMRS web & backend
docker compose --profile apps --profile ws up -d --build  # + Redpanda & medical-ws
docker compose ps
```

Setelah itu: migrasi/seed SIMRS sekali jalan, lalu buka `http://localhost:3000`.

```bash
docker compose exec simrs-web npx prisma migrate deploy
docker compose exec simrs-web npx prisma db seed
```

Relay outbox SIMRS berjalan sebagai service `simrs-relay` di profil `apps`.

## Jalankan manual (tanpa Docker untuk app-nya)

### 1. SIMRS Dummy (:3000)

```bash
cd simrs-dummy/medical-simrs-web
cp .env.example .env      # DATABASE_URL → localhost:5433, NEXTAUTH_*, QR_BASE_URL
npm install
npx prisma migrate deploy && npx prisma db seed
npm run dev               # atau: npm run build && npm start
```

Relay webhook (terminal terpisah, wajib untuk mengirim event ke backend):

```bash
npm run relay
```

### 2. medical-backend (:8080, dipublikasikan :8082)

```bash
cd medical-backend
cp .env.example .env      # lihat tabel env di bawah
mvn spring-boot:run       # atau: mvn -DskipTests package && java -jar target/monitoring-0.1.0.jar
```

Flyway membuat skema + akun demo `admin` / `admin-local-change-me` (ganti sebelum dipakai di luar lokal).

### 3. medical-ws (:8081, dipublikasikan :8083)

```bash
cd medical-ws
cp .env.example .env
npm install && npm run check && npm start
```

### 4. Dashboard monitoring (:3100 dev)

```bash
cd medical-dashboard-monitoring/frontend
npm install
# .env.local — lihat tabel env di bawah
npm run dev -- -p 3100    # atau: npm run build && npm start
```

Login dashboard memakai akun backend (ADMIN untuk mengaktifkan relay).

## Env per service

### SIMRS Dummy — `simrs-dummy/medical-simrs-web/.env`

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | `postgresql://simrs_app:<pass>@localhost:5433/simrs_dummy?schema=public` |
| `NEXTAUTH_URL`, `QR_BASE_URL` | Origin SIMRS apa adanya (mis. `http://localhost:3000`). `QR_BASE_URL` dipakai isi QR gelang |
| `NEXTAUTH_SECRET`, `AUTH_SECRET` | string acak; `AUTH_SECRET` juga fallback kunci HMAC QR |
| `QR_SIGNING_SECRET`, `QR_TOKEN_TTL_SECONDS` | opsional; kunci HMAC token QR + masa berlaku |
| `MONITORING_TOKEN` | token bersama untuk konsumen mesin (`x-monitoring-token`) |
| `MONITORING_CALLBACK_URL` | `http://localhost:8082` — tujuan relay webhook |
| `MONITORING_CALLBACK_TOKEN` | harus **sama** dengan `SIMRS_WEBHOOK_TOKEN` backend |
| `COOKIE_SECURE` | `true` hanya bila diakses via HTTPS |

### medical-backend — `medical-backend/.env`

| Variabel | Isi |
|---|---|
| `SERVER_PORT` | `8080` (di dalam kontainer); host dipetakan `MEDICAL_BACKEND_PORT` |
| `DATABASE_URL` / `DATABASE_USER` / `DATABASE_PASSWORD` | JDBC ke PostgreSQL medical (`localhost:5434/nevo` bila Docker) |
| `SIMRS_ENABLED` | `true` untuk mengaktifkan polling SIMRS |
| `SIMRS_BASE_URL` | `http://localhost:3000` (nanti: `https://simrs.cdprojectdiagonal.web.id/`) |
| `SIMRS_MONITORING_TOKEN` | = `MONITORING_TOKEN` SIMRS |
| `SIMRS_WEBHOOK_TOKEN` | = `MONITORING_CALLBACK_TOKEN` SIMRS |
| `SIMRS_WRITE_ENABLED` | `true` hanya bila backend boleh POST status ke SIMRS |
| `INTERNAL_PUBLISH_URL` | `http://localhost:8083/internal/publish` |
| `INTERNAL_PUBLISH_SECRET` | **wajib sama** dengan `INTERNAL_PUBLISH_SECRET` di `medical-ws` |
| `ROBOT_MODE` | `sim` (default; `SimulatedRobotService`) atau `real` (aktif `RealRobotAdapter` — downlink ke robot fisik via gateway) |
| `GATEWAY_URL` | URL gateway `medical-ws`, mis. `http://localhost:8083` — dipakai `RealRobotAdapter` untuk downlink + `GET /internal/robots` (`x-internal-secret` = `INTERNAL_PUBLISH_SECRET`); kosong = `RealRobotAdapter` 503 |
| `NEVO_WS_ALLOWED_ORIGINS` | origin dashboard yang boleh memanggil WS backend |

### medical-ws — `medical-ws/.env`

| Variabel | Isi |
|---|---|
| `WS_PORT` / `WS_PATH` | `8081` / `/ws/v1/deliveries` |
| `WS_AUTH_TOKEN` | Bearer klien mesin. **Kosong = semua koneksi ditolak (`4401`)** |
| `INTERNAL_PUBLISH_SECRET` | **Kosong = `/internal/publish` menolak semua request (`401`)** |
| `KAFKA_ENABLED` | `false` = hanya bridge HTTP (cukup untuk demo) |
| `KAFKA_BROKERS`, `TOPIC_EVENTS`, `TOPIC_DLQ` | diisi saat Kafka dinyalakan (`KAFKA_ENABLED=true`) |

### Dashboard — `medical-dashboard-monitoring/frontend/.env.local`

| Variabel | Isi |
|---|---|
| `BACKEND_URL` | REST backend, mis. `http://127.0.0.1:8082`. Dipakai BFF `/api/proxy/[...path]` dan `/api/ws/session` |
| `WS_BACKEND_URL` | `ws://127.0.0.1:8083/ws/v1/deliveries` — satu-satunya jalur data event yang nyata |
| `WS_AUTH_TOKEN` | sekadar perlu kecocokan dengan gateway; hanya dibaca server (BFF) |
| `NEXT_PUBLIC_WS_RELAY_URL` | default `/api/ws/stream`; hanya diubah bila relay dipindah |

`NEXT_PUBLIC_*` di-inline saat **build**: mengubahnya berarti rebuild, bukan sekadar restart.
Semua nilai di atas juga bisa **dioverride runtime** dari halaman `/settings` (disimpan
server-side di BFF `data/settings.json`) — env hanya jadi default awal. Detail:
`docs/web-monitoring/FEATURE_MAP_4B.md` §4.

## Halaman Settings dashboard (koneksi runtime)

Di `/settings` (login ADMIN) ada: **Backend URL**, **WebSocket URL**, token gateway (Bearer),
dan centang relay.

- Save = `POST /api/ws/session` `setConnection` → nilai disimpan server-side di BFF
  (`data/settings.json`), **bukan localStorage**; BFF melepas koneksi WS lama dan reconnect
  dengan endpoint/token baru tanpa rebuild. Relay hidup kembali jika toggle aktif.
- Token WS disimpan hanya di server BFF; browser hanya melihat 4 karakter pertama (aturan 7).
- **Test Connection** hanya validasi sintaks URL — konektivitas nyata terlihat dari status
  relay/aliran event setelah Save.
- Env tetap jadi nilai default awal; kalau runtime override pernah disimpan, override itu
  yang dipakai sampai diubah dari `/settings` lagi.

## Cek cepat setelah semua hidup

```bash
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8082/actuator/health   # 200
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/                  # 200
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8083/healthz           # 200
```

Lalu buka dashboard, login ADMIN, ON-kan relay di `/settings`, ajukan pengantaran di SIMRS, ikuti status
sampai `MOCK_ARRIVED_AT_ROOM`, dan tutup lewat scan QR `/scan/{mrn}`.

## Uji robot fisik (downlink, ROBOT_MODE=real)

Prasyarat satu rahasia: `INTERNAL_PUBLISH_SECRET` dan `WS_AUTH_TOKEN` sama di gateway,
backend, dan publisher (sumber tunggal: `simrs-dummy/.env` untuk compose). Kontrak:
`docs/api-contracts/robot-ws-tifa.md` (frame SI/ACK/downlink/result).

1. **Env** — backend: `ROBOT_MODE=real`, `GATEWAY_URL=http://localhost:8083` (kontainer:
   `http://medical-ws:8081`), `INTERNAL_PUBLISH_SECRET` ↔ gateway. Dashboard: relay ON via
   `/settings`. Mulai semua (compose + `npm run dev` medical-ws + backend + dashboard).
2. **Cek mode** — `GET /robots` backend: `simulated:true` di mode `sim`; setelah robot
   tersambung di mode `real`, robot yang tersambung muncul `simulated:false`, status
   `IDLE` bila handshaken (mati/putus → `OFFLINE`, fail-closed).
3. **Hubungkan robot** — WS `ws://host:8083/ws/v1/deliveries` + `Authorization: Bearer
   $WS_AUTH_TOKEN` (token salah → close 4401). Kirim frame SI:
   `{"code":"SI","data":{"type":"ROBOT","robot_id":"nevo-01"}}` → balasan `ACK_SOFT`
   (dup → 4002, invalid → 4003). Ulang cepat tanpa robot nyata: `WS_PORT=8099 node
   scripts/tifa-selfcheck.js` di `medical-ws/`.
4. **Perintah downlink** — dashboard `/robots`, pilih robot, kirim dari tombol (Set speed
   `0..2`, Teleop linear −1..1 / angular −2..2) atau **WASD** (W/S maju/mundur, A/D putar;
   lepas tombol = perintah berhenti {0,0}). Backend memvalidasi parameter — yang invalid
   ditolak di backend dan **tidak pernah sampai robot**; robot menerima frame
   `ROBOT_COMMAND` `{commandId, robotId, command, issuedBy, params}`.
5. **Hasil** — robot membalas `ROBOT_COMMAND_RESULT {result:"OK"/"REJECTED", reason}` →
   muncul di dashboard (telemetri/event). Catatan terbuka: hasil juga ke Kafka
   `simrs.robot.events.v1`, tetapi backend belum mengonsuminya, jadi kolom
   `t_robot_command.result` masih null (tercatat di kontrak §6).
6. **Edge** — command saat robot tidak tersambung: backend meneruskan, gateway menjawab
   sendiri `REJECTED/UNKNOWN_ROBOT` (perintah tidak boleh antre). Cancel/tombol lain
   berlaku sama seperti mode sim; `t_robot_command` terisi dedupe `commandId`.

## Go-live yang direncanakan

SIMRS akan dipublikasikan di `https://simrs.cdprojectdiagonal.web.id/`. Saat itu terjadi, ganti
`SIMRS_BASE_URL`, `MONITORING_CALLBACK_URL`, `NEXTAUTH_URL`, dan `QR_BASE_URL` ke domain tersebut
(plus `COOKIE_SECURE=true`). Dashboard dan gateway tidak perlu domain baru; cukup env backend/BFF.

Jika gateway `medical-ws` di-deploy di server yang sama, amankan WS lewat proxy HTTPS:
`wss://simrs.cdprojectdiagonal.web.id/ws/v1/deliveries` → proxy pass ke kontainer `WS_PORT`
(cookie/secret tetap dari env, tidak ada token di URL — aturan 5). BFF dashboard memakai
`WS_BACKEND_URL` dengan `wss://` bila lewat TLS, atau `ws://host:8083` bila jaringan internal.

### Checklist konek manual dashboard ↔ SIMRS go-live

Halaman `/settings` dashboard kini aktif (koneksi runtime server-side — lihat seksi
`/settings` di atas). Yang benar-benar dipakai koneksi oleh server BFF:

1. Di **mesin yang menjalankan dashboard**, isi env BFF: `BACKEND_URL` (REST SIMRS/backend),
   `WS_BACKEND_URL` (`wss://.../ws/v1/deliveries`), `WS_AUTH_TOKEN` (gateway; tidak boleh kosong).
2. Jika ada `NEXT_PUBLIC_*` yang berubah, **rebuild** dashboard (di-inline saat build, bukan restart).
3. Gateway server: `WS_AUTH_TOKEN` + `INTERNAL_PUBLISH_SECRET` harus sama nilainya dengan
   yang dipakai publisher (satu sumber: `simrs-dummy/.env` untuk compose).
4. Verifikasi: `/api/v1/monitoring/active-deliveries` dari backend, lalu buka `/robots`
   dan pastikan event live masuk (cek `docs/testing-postman-simrs-web-monitoring.md` G4).

## Dokumen acuan

- `docs/README.md` — indeks docs + status kebenaran tiap dokumen
- `docs/api-contracts/` — kontrak REST, WS, event, HMI, bridge internal
- `docs/web-monitoring/FEATURE_MAP_4B.md` — handoff redesain dashboard (peta fitur `sstifa/`)
- `docs/testing-postman-simrs-web-monitoring.md` — checklist E2E + koleksi Postman + bukti live G1–G4
- `docs/integration-roadmap-two-weeks.md` — rencana Hari 1–10 (relatif)
- `docs/findings-analisis-tifa.md`, `docs/mapping-and-goals/` — analisis historis, **bukan** sumber kebenaran
