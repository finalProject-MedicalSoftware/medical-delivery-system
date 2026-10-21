# NEVO Web Monitoring — Panduan Setup dari Awal

Dokumen ini menjelaskan cara menyiapkan dan menjalankan Web Monitoring NEVO pada komputer baru menggunakan Windows PowerShell maupun terminal macOS/Linux.

## 1. Struktur proyek

```text
medical-dashboard-monitoring/
├── backend/       # Spring Boot REST API, WebSocket internal, Flyway
├── frontend/      # Next.js App Router, TypeScript, Tailwind CSS, PWA
├── docs/          # Dokumentasi kontrak integrasi
├── samples/       # Contoh YAML SIMRS dan aset peta
└── docker-compose.yml
```

## 2. Prasyarat

Install perangkat berikut:

- Java JDK 21
- Maven 3.9 atau lebih baru
- Node.js 20 atau lebih baru
- npm
- Docker Desktop dan Docker Compose
- Git

Verifikasi instalasi:

```powershell
java -version
mvn -version
node --version
npm --version
docker --version
docker compose version
```

## 3. Ambil source code

```powershell
git clone <URL_REPOSITORY>
cd medical-dashboard-monitoring
```

Jangan commit file rahasia seperti `backend/.env`, token SIMRS, password database, atau password demo.

## 4. Siapkan PostgreSQL

Pastikan Docker Desktop sedang berjalan, lalu dari folder root proyek jalankan:

```powershell
docker compose up -d postgres
```

Konfigurasi database default:

```text
Host:     localhost
Port:     5432
Database: nevo
User:     nevo
Password: change-me
```

Periksa container:

```powershell
docker compose ps
```

Untuk menghentikan database tanpa menghapus data:

```powershell
docker compose stop postgres
```

Jangan gunakan `docker compose down -v` kecuali memang ingin menghapus seluruh volume database.

## 5. Konfigurasi environment backend

Buat file `backend/.env` secara lokal. Contoh konfigurasi:

```dotenv
SERVER_PORT=8081

DATABASE_URL=jdbc:postgresql://localhost:5432/nevo
DATABASE_USER=nevo
DATABASE_PASSWORD=change-me

NEVO_DEMO_ADMIN_PASSWORD=admin-local-change-me
NEVO_DEMO_OPERATOR_PASSWORD=operator-local-change-me

SIMRS_ENABLED=false
SIMRS_BASE_URL=https://simrs.example.local
SIMRS_MONITORING_TOKEN=isi-token-di-environment-saja
SIMRS_WRITE_ENABLED=false
SIMRS_POLL_INTERVAL_SECONDS=30
SIMRS_CONNECT_TIMEOUT_MS=5000
SIMRS_READ_TIMEOUT_MS=10000
```

Catatan keamanan:

- `SIMRS_MONITORING_TOKEN` hanya dibaca backend dan tidak dikirim ke browser.
- Gunakan `SIMRS_ENABLED=false` jika SIMRS belum tersedia.
- Gunakan `SIMRS_WRITE_ENABLED=false` untuk mode read-only.
- Jangan menaruh token di source code atau file frontend.
- Jangan mengubah `SIMRS_WRITE_ENABLED` menjadi `true` tanpa persetujuan pemilik SIMRS.

## 6. Memuat `.env` ke PowerShell

Spring Boot tidak otomatis membaca file `.env`. Muat variabel ke proses PowerShell sebelum menjalankan Maven:

```powershell
cd backend

Get-Content .env | ForEach-Object {
    $line = $_.Trim()
    if ($line -and !$line.StartsWith('#')) {
        $key, $value = $line -split '=', 2
        [Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), 'Process')
    }
}
```

Variabel hanya berlaku pada terminal tersebut. Jika membuka terminal baru, ulangi langkah ini.

## 7. Jalankan backend Spring Boot

Dari folder `backend`:

```powershell
mvn spring-boot:run
```

Saat startup, Flyway akan menjalankan migrasi database secara otomatis, termasuk:

- mapping dan waypoint
- mission dan audit
- direktori live SIMRS
- cache read-only SIMRS

Backend tersedia di:

```text
http://localhost:8081
```

Pemeriksaan cepat:

```powershell
Invoke-WebRequest http://localhost:8081/actuator/health
Invoke-WebRequest http://localhost:8081/api/v1/integrations/simrs/status
```

Jika port 8081 sudah digunakan, ubah `SERVER_PORT` pada environment dan sesuaikan `BACKEND_URL` serta port WebSocket frontend.

## 8. Login demo

Akun demo dibuat dari environment backend:

```text
Username: admin
Password: nilai NEVO_DEMO_ADMIN_PASSWORD

Username: operator
Password: nilai NEVO_DEMO_OPERATOR_PASSWORD
```

Role admin dan operator memiliki hak akses berbeda. Gunakan password baru pada lingkungan selain demo lokal.

## 9. Instalasi dependency frontend

Buka terminal kedua dari folder root proyek:

```powershell
cd frontend
npm install
```

Buat atau periksa `frontend/.env.local`:

```dotenv
BACKEND_URL=http://127.0.0.1:8081
NEXT_PUBLIC_BACKEND_WS_PORT=8081
```

`BACKEND_URL` dipakai oleh route proxy Next.js. Browser tidak mengakses token SIMRS secara langsung.

## 10. Jalankan frontend development

Dari folder `frontend`:

```powershell
npm run dev
```

Buka:

```text
http://localhost:3000/login
```

Halaman utama aplikasi:

```text
/dashboard
/control
/monitoring
/missions
/simrs
/mapping
/settings
```

## 11. Integrasi SIMRS

Integrasi SIMRS menggunakan HTTP polling backend sesuai kontrak final. Backend mengambil data secara otomatis setiap interval environment, default 30 detik, melalui endpoint resmi:

```text
GET /api/v1/monitoring/mapping
GET /api/v1/monitoring/snapshot
GET /api/v1/monitoring/active-deliveries
```

Header token dikirim oleh backend:

```text
x-monitoring-token: <token dari SIMRS_MONITORING_TOKEN>
```

Frontend hanya menerima status dan data yang sudah diproses backend. Token tidak pernah dikirim ke browser.

Jika SIMRS belum tersedia, gunakan:

```dotenv
SIMRS_ENABLED=false
```

Status yang dapat muncul antara lain `CONNECTED`, `AUTH_ERROR`, `DISCONNECTED`, `STALE`, dan `DISABLED`.

Jangan menambahkan WebSocket atau Kafka untuk SIMRS. WebSocket yang tersedia adalah WebSocket internal NEVO untuk telemetry robot.

## 12. Upload peta dan YAML

Pada menu `Peta & Waypoint`:

1. Upload konfigurasi `map.yaml`.
2. Upload gambar occupancy grid `.pgm` atau `.png` sesuai nama file pada YAML.
3. Pilih peta yang tersedia.
4. Tambahkan atau kelola waypoint sesuai role pengguna.

Contoh data tersedia di folder `samples/`.

Upload YAML SIMRS adalah import/preview manual. Sumber data live utama tetap endpoint SIMRS resmi.

## 13. Production build frontend

Dari folder `frontend`:

```powershell
npm run build
npm start -- -p 3000
```

PWA membutuhkan production build untuk pengujian Service Worker. Aset PWA tersedia di:

```text
/manifest.webmanifest
/sw.js
/offline
/icons/nevo-192.png
/icons/nevo-512.png
```

Service Worker hanya menyimpan aset statis yang aman. Endpoint `/api/`, WebSocket, token, dan data SIMRS dinamis tidak disimpan dalam Cache Storage.

## 14. Pengujian

Backend:

```powershell
cd backend
mvn test
```

Frontend:

```powershell
cd frontend
npm run build
```

Uji manual minimal:

1. Login sebagai operator.
2. Pastikan dashboard berhasil memuat.
3. Pastikan status Backend API dan WebSocket terlihat.
4. Pastikan `/simrs` menampilkan status SIMRS.
5. Pastikan perubahan data SIMRS masuk melalui polling tanpa upload YAML.
6. Putuskan backend dan pastikan perintah navigasi dinonaktifkan.
7. Hubungkan kembali backend dan pastikan state robot dimuat ulang.
8. Uji halaman `/offline` pada production build.

## 15. Troubleshooting

### Port 8081 sudah digunakan

```powershell
Get-NetTCPConnection -LocalPort 8081 -State Listen
```

Hentikan proses yang memang milik aplikasi NEVO, atau ubah `SERVER_PORT` ke port lain. Jangan menghentikan proses secara membabi buta jika belum memeriksa PID-nya.

### Port 5432 sudah digunakan

Periksa aplikasi PostgreSQL lain atau ubah port mapping Docker. Jika port host diubah, sesuaikan `DATABASE_URL`:

```dotenv
DATABASE_URL=jdbc:postgresql://localhost:<port-baru>/nevo
```

### Flyway gagal checksum

Jangan mengedit migration yang sudah pernah diterapkan. Periksa status database terlebih dahulu. `flyway:repair` hanya digunakan setelah memastikan perubahan migration dan database memang aman untuk diperbaiki.

### Backend unavailable pada frontend

Pastikan:

1. PostgreSQL hidup.
2. Backend berjalan di port yang benar.
3. `frontend/.env.local` menunjuk ke backend yang benar.
4. Browser sudah membuka ulang halaman setelah konfigurasi berubah.

### SIMRS unauthorized

Periksa:

1. `SIMRS_BASE_URL` benar dan menggunakan HTTPS.
2. `SIMRS_MONITORING_TOKEN` sesuai token aktif.
3. Header `x-monitoring-token` dikirim oleh backend.
4. Tidak ada redirect ke host yang tidak tepercaya.
5. Backend sudah direstart setelah perubahan environment.

### SIMRS tidak tersedia

Ini tidak seharusnya membuat backend gagal startup. Backend mempertahankan cache valid dan menampilkan status stale/offline sesuai kondisi koneksi.

## 16. Penghentian aplikasi

Pada terminal backend atau frontend tekan:

```text
Ctrl + C
```

Hentikan PostgreSQL Docker jika tidak diperlukan:

```powershell
docker compose stop postgres
```

Data database tetap tersimpan pada volume Docker.

## 17. Batasan penting

- Robot fisik dan ROS 2 membutuhkan bridge/runtime terpisah.
- Mode simulasi web tidak boleh dianggap sebagai telemetry robot fisik.
- SIMRS Dummy tidak boleh dimodifikasi dari proyek ini.
- Jangan mengirim POST perubahan status ke SIMRS publik tanpa persetujuan.
- HTTP Basic/demo authentication hanya untuk pengembangan lokal, bukan deployment produksi.
- Deployment produksi memerlukan TLS, identity management, secret manager, audit, backup database, dan hardening server.
