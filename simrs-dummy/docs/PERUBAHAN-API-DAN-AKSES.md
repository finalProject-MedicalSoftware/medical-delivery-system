# SIMRS — catatan perubahan API & alur akses

Berlaku untuk branch `feat/simrs-hardening` (repo `medical-simrs-dummy`). Untuk rekan backend / WS / dashboard.

## 1. Perubahan API

| Endpoint | Status | Isi |
|---|---|---|
| `GET /api/v1/monitoring/stream` | **BARU** | SSE perubahan status. Header `x-monitoring-token` (sama dengan endpoint monitoring lain). Event: `ready`, `delivery` `{requestCode, roomCode, from, to, at}`, `prescription` `{at}`, komentar `: ping` tiap 2 dtk saat sepi. Pakai `fetch` stream (EventSource browser tidak bisa kirim header). Polling DB 2 dtk — pelengkap, **bukan pengganti** outbox+webhook (itu tetap jalur at-least-once ke backend). |
| `GET /api/live` | **BARU (internal UI)** | SSE untuk UI SIMRS sendiri (sesi cookie). Bukan kontrak untuk konsumen luar. |
| `POST /api/v1/monitoring/delivery-status` | tetap | Body & transisi tidak berubah. |
| `GET /api/v1/monitoring/{snapshot,active-deliveries,patient/{mrn},mapping}` | tetap | Tidak ada perubahan bentuk. |
| Webhook outbox → `POST {backend}/webhooks/simrs` | tetap | Envelope & `idempotencyKey` sama. |

**Rename status wire (PERUBAHAN KONTRAK, sudah diterapkan di SIMRS + backend + dashboard pada branch ini):** `MOCK_IN_TRANSIT`→`IN_TRANSIT`, `MOCK_ARRIVED_AT_ROOM`→`ARRIVED_AT_ROOM`, `MOCK_HANDOVER_CONFIRMED`→`HANDOVER_CONFIRMED`. Berlaku di API monitoring, payload outbox/webhook, dan database SIMRS (enum Prisma + migrasi data `20261118020000_rename_mock_statuses`). `POST /monitoring/delivery-status` masih menerima nama lama (`MOCK_*`) pada input selama masa transisi, tetapi semua respons/event memakai nama baru. Penerapan harus serentak: deploy SIMRS, backend, dan dashboard bersama-sama.

Field `simulation: true` (mapping) dan `simulationLabel` (event) **dihapus** bersama awalan MOCK. `isSimulation` pada riwayat event kini selalu `false`.

Lihat juga `docs/KONTRAK-DATA-SIMRS-KE-WEB.md` (field `items[]`, `priority`, `allergies`, `handling`, `actor`) — penambahan bersifat aditif.

## 2. Perubahan keamanan SIMRS
- `AUTH_SECRET`/`NEXTAUTH_SECRET` wajib di production (tanpa fallback hardcode).
- IP klien untuk throttle login/monitoring hanya dibaca dari `X-Forwarded-For` bila `TRUST_PROXY=true` (default `false`).
- Perbandingan token monitoring constant-time.

## 2a. Alur pengantaran (diperbarui)
Ajukan pengantaran (SIMRS) → **belum terlihat di web monitoring** → petugas menekan **Kirim ke Robot** → baru masuk monitoring sebagai misi (status `PENDING_INTEGRATION`). Pasien tidak menular boleh diajukan dengan alasan wajib. Rinciannya di `KONTRAK-DATA-SIMRS-KE-WEB.md`.

## 2b. Fitur SIMRS baru (untuk uji manual)
Prioritas resep (rutin/mendesak/STAT), alergi pasien + peringatan di resep, penanganan khusus obat, stok menipis + riwayat stok, riwayat serah terima & pindah ruang per pasien, berita acara serah terima (cetak), halaman Integrasi (antrean outbox + kirim ulang), Laporan (+CSV), audit CSV, indikator "pembaruan langsung".

## 3. Env baru
- `TRUST_PROXY` (default `false`), di `medical-simrs-web/.env.example`.

## 4. Alur akses (Docker all-in-one, jalankan dari `simrs-dummy/`)

```sh
docker compose --profile apps --profile ws up -d --build
docker compose ps
```

| Layanan | URL | Catatan |
|---|---|---|
| SIMRS | http://127.0.0.1:3000 (migrasi database dijalankan otomatis saat container start; data demo baru: `docker compose exec simrs-web npx tsx prisma/seed.ts`; bila port bentrok: `SIMRS_WEB_PORT=3001 NEXTAUTH_URL=http://localhost:3001 docker compose ... up`) | login petugas (akun demo di bawah form login; password `demo12345`) |
| Web Monitoring | http://127.0.0.1:3100 | login backend (default dev `admin` / `admin-local-change-me`), koneksi di `/settings` |
| Backend | http://127.0.0.1:8082 | `GET /actuator/health` |
| WS gateway | ws://127.0.0.1:8083/ws/v1/deliveries | `GET /healthz` |
| DB SIMRS / Backend | 127.0.0.1:5433 / 5434 | volume tetap saat `down` |

Alur uji: login SIMRS (mis. `dr_budi`) → buat resep → `apt_dewi` verifikasi & siapkan → ajukan pengantaran → status berubah di SIMRS tanpa reload (SSE) → outbox/relay kirim webhook ke backend → dashboard monitoring menampilkan status.

`docker compose --profile apps --profile ws down` menghapus container saja; **jangan** pakai `-v` (hapus database).

## 5. Catatan build dashboard (milik rekan)
`medical-dashboard-monitoring/frontend/app/api/ws/command/route.ts` gagal `next build`: setelah gate "hanya TELEOP stop", TypeScript mempersempit `code` jadi `'TELEOP'` sehingga cek `code === 'MAP_SELECTED'` dianggap mustahil. Perbaikan lokal: `(code as string) === 'MAP_SELECTED'`. **Rekan perlu menerapkan perbaikan yang sama di repo WEB-MONITORING** (atau menghapus cabang mati itu).
