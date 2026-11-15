# Docker untuk redesign dashboard

Jalankan perintah PowerShell berikut dari workspace `D:\SEMESTER 7\TA`.
Seluruh password/token Docker memakai satu sumber: `simrs-dummy/.env`.
File `.env` di folder frontend tidak diperlukan untuk workflow Docker ini.

## 1. Nyalakan Docker Desktop

Pastikan engine Docker aktif, lalu masuk ke folder orkestrator:

```powershell
cd "D:\SEMESTER 7\TA\medical-delivery-system\simrs-dummy"
docker info
```

## 2. Jalankan dashboard dengan hot reload

```powershell
docker compose -f compose.yaml -f compose.dashboard-dev.yaml --profile apps --profile ws up -d --build
docker compose -f compose.yaml -f compose.dashboard-dev.yaml --profile apps --profile ws ps
```

Perintah ini menjalankan dua PostgreSQL, backend Spring, SIMRS web, relay,
Redpanda, gateway WebSocket, dan dashboard Next.js development.
Backend menjalankan migrasi Flyway secara otomatis.

## 3. Inisialisasi database SIMRS saat pertama menjalankan

```powershell
docker compose exec simrs-web npx prisma migrate deploy
docker compose exec simrs-web npm run db:seed
```

Seed menyediakan data sintetis untuk halaman integrasi/dashboard. Gunakan
`npm run db:seed`: script ini sudah terdefinisi di package.json SIMRS.
Jika relay sempat mencatat tabel belum tersedia sebelum migrasi, periksa log
setelah inisialisasi; relay mengulangi polling secara otomatis.

## 4. Buka dashboard

- Dashboard: http://localhost:3100/login
- SIMRS: http://localhost:3000/login
- Health backend: http://localhost:8082/actuator/health
- Health gateway: http://localhost:8083/healthz

Login dashboard memakai akun demo backend `admin` / `admin-local-change-me`.
Password tersebut dibuat oleh migrasi database, terpisah dari password database
dan token service di `.env`. Anda dapat menggantinya dari halaman akun.
Login SIMRS demo: `sysadmin` / `demo12345`.

Di `/settings`, gunakan koneksi internal berikut bila perlu mengatur ulang:

```text
Backend URL:   http://medical-backend:8080
WebSocket URL: ws://medical-ws:8081/ws/v1/deliveries
```

Token gateway sudah diambil server dari `WS_AUTH_TOKEN` di `.env`.
Aktifkan relay (Turn on); identitas UI default dihasilkan dari username.
Jika pernah menyimpan override koneksi/token di Settings, override tersebut
mendahului env: sesuaikan endpoint dan token dengan `.env` lalu simpan.
Alamat internal di atas dipanggil server dashboard dari dalam Docker;
alamat `localhost:3100` dipakai browser di Windows.

## 5. Mulai redesign

Edit file di `medical-dashboard-monitoring/frontend/app/`.
Bind mount dan hot reload akan menampilkan perubahan tanpa rebuild image.
Output `.next`, dependency Linux, dan setting dashboard memakai volume terpisah.
Jika package.json/package-lock.json berubah, perbarui dependency development:

```powershell
docker compose -f compose.yaml -f compose.dashboard-dev.yaml exec dashboard npm ci
docker compose -f compose.yaml -f compose.dashboard-dev.yaml restart dashboard
```

Melihat log:

```powershell
docker compose logs -f dashboard medical-backend medical-ws
```

Menghentikan stack tanpa menghapus data:

```powershell
docker compose -f compose.yaml -f compose.dashboard-dev.yaml --profile apps --profile ws stop
```

Gunakan kembali perintah `up` pada langkah 2 untuk melanjutkan.
Jangan menggunakan `down -v` jika ingin mempertahankan data database.

## Build biasa tanpa hot reload

```powershell
docker compose --profile apps --profile ws up -d --build
```

Pada mode ini, perubahan source membutuhkan rebuild dashboard:

```powershell
docker compose --profile apps up -d --build dashboard
```

## Catatan konfigurasi

- `.env` lokal berisi delapan secret acak yang berbeda (32 byte masing-masing).
- Dashboard dan gateway menerima `WS_AUTH_TOKEN` yang sama dari Compose.
- Backend dan gateway berbagi `INTERNAL_PUBLISH_SECRET`.
- Relay dan backend berbagi `SIMRS_WEBHOOK_TOKEN`.
- SIMRS dan backend berbagi `MONITORING_TOKEN`.
- Polling SIMRS lokal aktif (`SIMRS_ENABLED=true`); penulisan status dari backend
  tetap nonaktif (`SIMRS_WRITE_ENABLED=false`).
- Akun login dashboard berasal dari database backend; token service bukan password login.
- Port dapat disesuaikan melalui `.env`; pastikan NEXTAUTH_URL mengikuti port SIMRS.

## Pemulihan P3018 pada database SIMRS lokal baru

Versi lama menamai migrasi penghapusan jadwal `20260101000000_remove_schedule_fields`,
sehingga dijalankan sebelum tabel dibuat. Migrasi tersebut sekarang bernama
`20261027000000_remove_schedule_fields`, sesudah migrasi penambahan kolom jadwal.
Jika database lokal baru terlanjur gagal pada migrasi lama, pastikan belum ada
tabel/data aplikasi sebelum menjalankan pemulihan berikut dari `simrs-dummy`:

```powershell
docker compose exec simrs-web npx prisma migrate resolve --rolled-back 20260101000000_remove_schedule_fields
docker compose -f compose.yaml -f compose.dashboard-dev.yaml --profile apps --profile ws up -d --build simrs-web simrs-relay
docker compose exec simrs-web npx prisma migrate deploy
docker compose exec simrs-web npm run db:seed
docker compose exec simrs-web npx prisma migrate status
```

Langkah ini mempertahankan volume database. Jika migrasi lama sudah berhasil
diterapkan pada database lain yang berisi data, periksa riwayat migrasinya
terlebih dahulu; jangan gunakan prosedur database baru ini secara langsung.
