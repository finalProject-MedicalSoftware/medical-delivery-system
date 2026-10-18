# Setup Database SIMRS Dummy

Dokumen ini hanya mengatur PostgreSQL development untuk SIMRS Dummy. Ini belum menyalakan aplikasi SIMRS, backend medis, WebSocket gateway, atau Kafka.

## 1. Persiapan

- Pastikan Docker Desktop aktif.
- pgAdmin boleh tetap berjalan secara lokal di macOS.
- Dari folder root `medical-delivery-system/`, salin `.env.example` menjadi `.env` dan ubah `SIMRS_DB_PASSWORD` menjadi password lokal yang unik.

```bash
cp .env.example .env
```

Jangan commit `.env` ke Git dan jangan gunakan password development ini di lingkungan produksi.

## 2. Jalankan PostgreSQL

```bash
docker compose up -d simrs-postgres
```

Periksa status:

```bash
docker compose ps
docker compose logs -f simrs-postgres
```

Cek kesiapan database:

```bash
docker compose exec simrs-postgres pg_isready -U simrs_app -d simrs_dummy
```

## 3. Hubungkan pgAdmin

Di pgAdmin, daftarkan server baru:

- **Name:** SIMRS Dummy (Docker)
- **Host name/address:** `127.0.0.1` atau `localhost`
- **Port:** `5433`
- **Maintenance database:** `simrs_dummy`
- **Username:** `simrs_app`
- **Password:** nilai `SIMRS_DB_PASSWORD` di file `.env`

Port 5433 di Mac diteruskan ke port 5432 dalam container. Port sengaja hanya di-bind ke loopback (`127.0.0.1`) untuk development lokal.

## 4. Perintah sehari-hari

```bash
# Status container
docker compose ps

# Log Postgres
docker compose logs -f simrs-postgres

# Masuk ke psql
docker compose exec simrs-postgres psql -U simrs_app -d simrs_dummy

# Stop container tanpa menghapus data
docker compose stop simrs-postgres

# Jalankan lagi
docker compose start simrs-postgres
```

**Peringatan:** `docker compose down -v` menghapus volume database dan data di dalamnya. Jangan jalankan perintah tersebut kecuali memang berniat menghapus data development.

## 5. Batas database

Database `simrs_dummy` dikhususkan untuk aplikasi SIMRS Dummy. Database untuk Web Monitoring/Robot Control akan dibuat sebagai layanan dan database terpisah saat fase aplikasi tersebut dimulai. Jangan membuat tabel robot atau mencampur data robot ke schema SIMRS tanpa keputusan arsitektur yang terdokumentasi.
