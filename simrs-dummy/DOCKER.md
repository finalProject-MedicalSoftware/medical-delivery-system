# Docker all-in-one (prototipe data sintetis — bukan sistem klinis)

Satu `compose.yaml` menjalankan seluruh layanan. Compose membangun semua repo lewat
path `build:` relatif (`../medical-backend`, `../medical-ws`, `../medical-dashboard-monitoring/frontend`,
`./medical-simrs-web`) — jadi **folder induk `medical-delivery-system/` harus utuh**, perintah
dijalankan dari dalam `simrs-dummy/`. Komunikasi antar-layanan lewat jaringan internal compose
(nama service + port container); yang dibuka ke host hanya port yang tercantum di bawah, semua
terikat `127.0.0.1` (tidak ter-export ke jaringan luar).

## Peta service

```
            [UPWELL]
simrs-postgres ── simrs-web (:3000) ── simrs-relay (outbox→webhook)
                                          │
health & monitoring  medical-backend (:8082)
                        │.publish
medical-postgres ◀──────┤
                        ▼
redpanda (Kafka, :9093) ◀── medical-ws (:8083) ── dashboard (:3100)  [BFF → browser]
```

| Service | Peran | Build dari | Host:Container |
|---|---|---|---|
| simrs-postgres | DB SIMRS Dummy | — | 5433:5432 |
| simrs-web | Aplikasi SIMRS (outbox) | `./medical-simrs-web` | 3000:3000 |
| simrs-relay | Kirim outbox → webhook backend | `./medical-simrs-web` | — (internal) |
| medical-backend | REST + adapter robot (`ROBOT_MODE`) | `../medical-backend` | 8082:8080 |
| medical-postgres | DB monitoring/backend | — | 5434:5432 |
| dashboard | Monitoring + kontrol robot (Next.js BFF) | `../medical-dashboard-monitoring/frontend` | 3100:3000 |
| redpanda | Kafka lokal (hanya untuk `medical-ws`) | — | 9093:9093 |
| medical-ws | Gateway WS: bridge HTTP→Kafka→broadcast | `../medical-ws` | 8083:8081 |

Pengaturan host port: `SIMRS_WEB_PORT`, `MEDICAL_BACKEND_PORT`, `MEDICAL_WS_PORT`, `DASHBOARD_PORT` di `.env`.

## Perintah

```sh
cp .env.example .env            # WAJIB: isi secret & token dulu
docker compose up -d            # dua PostgreSQL saja
docker compose --profile apps up -d --build              # + SIMRS, backend, relay, dashboard
docker compose --profile apps --profile ws up -d --build # seluruh rantai termasuk Kafka+WS
docker compose ps
docker compose logs -f medical-backend medical-ws dashboard
docker compose stop             # stop tanpa hapus volume
docker compose --profile apps --profile ws down   # hapus container (volume tetap)
```

> `down -v` **menghapus kedua database permanen** — jangan dijalankan tanpa sadar.

Dashboard di `http://127.0.0.1:3100` (login sesi backend, default dev `admin`/`admin-local-change-me`).
SIMRS di `http://127.0.0.1:3000`.

## Env (simrs-dummy/.env)

| Variabel | Keterangan |
|---|---|
| `SIMRS_DB_PASSWORD`, `MEDICAL_DB_PASSWORD` | wajib (password DB) |
| `NEXTAUTH_SECRET`, `AUTH_SECRET` | wajib (auth SIMRS) |
| `WS_AUTH_TOKEN` | token klien/gateway WS — harus cocok dengan yang dipakai dashboard/robot |
| `INTERNAL_PUBLISH_SECRET` | secret `/internal/publish` (bridge upstream + downlink robot) |
| `MONITORING_TOKEN`, `SIMRS_WEBHOOK_TOKEN` | token monitoring & webhook SIMRS→backend (opsional) |
| `SIMRS_ENABLED`, `SIMRS_WRITE_ENABLED` | `false` default; integrasi aktif setelah token/kontrak siap |
| `DASHBOARD_BACKEND_URL` (default `http://medical-backend:8080`), `DASHBOARD_WS_BACKEND_URL` (default `ws://medical-ws:8081/ws/v1/deliveries`), `DASHBOARD_PORT` | koneksi dashboard (override hanya bila perlu) |

## Checklist "semua hidup" (profil apps+ws)

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000        # 200  simrs-web
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100        # 200  dashboard
curl -s http://127.0.0.1:8082/actuator/health                          # UP   backend
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8083/healthz # 200  medical-ws
curl -s http://127.0.0.1:8083/webhooks/simrs/health                    # {"configured":true,...}
cd ../medical-ws && (set -a; . ../simrs-dummy/.env; set +a; node e2e.mjs)   # E2E bridge+Kafka+WS
```

## Troubleshooting (bug yang sudah ditemui)

| Gejala | Sebab | Penanganan |
|---|---|---|
| `NOT_THE_BACKEND` saat *Set connection* di `/settings` | URL yang diisi adalah web frontend SIMRS (Next.js) atau sudah dibubuhkan `/api/v1` | Isi **origin backend Spring** saja, contoh `http://127.0.0.1:8082` (host) / `http://medical-backend:8080` (antar-container). Dashboard kini meng-normalisasi trailing slash + suffix `/api/v1`, tapi isi origin yang benar |
| Build error `Identifier 'wsAuthToken' has already been declared` | memori dev server basi setelah edit (file di disk sudah benar) | restart `npm run dev` (hanya di jalur dev lokal, bukan Docker) |
| Dropdown pilihan robot kosong padahal robot teregistrasi | versi lama hanya menampilkan roster live gateway | sudah diperbaiki: dropdown = roster ∪ registry (`/api/proxy/robots/registry`); pastikan login berhasil dan backend hidup |
| Port bentrok saat `up` | port host sudah dipakai proses lain | ubah `*_PORT` di `.env` |
| Broadcast tidak terima event | token/konfig tidak cocok | cek `webhooks/simrs/health` → `configured:true`; pastikan `WS_AUTH_TOKEN` di `.env` dipakai klien; `eventId` sama → `400 DUPLICATE` (idempoten, by design) |

Penggantian kontras/aturan berikutnya diperbarui di dokumentasi, bukan diam-diam (AGENTS.md aturan 6).
