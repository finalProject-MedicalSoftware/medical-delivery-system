# Keputusan Stack SIMRS Dummy

## Baseline yang disarankan

| Area | Keputusan awal | Alasan |
|---|---|---|
| UI dan web framework | Next.js App Router | Mendukung UI React dan server-side route/data handling dalam satu aplikasi untuk prototipe. |
| Bahasa | TypeScript | Menambah pemeriksaan tipe pada model, form, dan API. |
| UI styling | Tailwind CSS + shadcn/ui | Cepat membangun komponen yang konsisten dan bisa disesuaikan. |
| Database | PostgreSQL 17 dalam container Docker | Reproducible dan terisolasi dari database lain. |
| DB admin | pgAdmin yang sudah ada di macOS | Tetap menggunakan alat yang familiar; koneksi ke `localhost:5433`. |
| ORM/migrations | Prisma ORM v7 | Ekosistem TypeScript dan migration workflow; gunakan rilis stabil, bukan versi 8 RC kecuali tim sengaja memilih RC. |
| Validasi | Zod | Validasi schema di boundary request/form. |
| Authentication | Auth.js | Pilihan awal; role dan permission aplikasi tetap harus diverifikasi di sisi server. |
| Authorization | `User`-`Role`-`UserRole` many-to-many plus permission checks | Satu pengguna bisa memiliki beberapa role. |
| Tests | Unit/integration + Playwright | Menguji state workflow, otorisasi, dan alur UI. |
| Local infra | Docker Compose | Menjalankan database reproducibly. Kafka ditunda. |

## Pilihan database dan pgAdmin

Gunakan PostgreSQL Docker khusus SIMRS Dummy, bukan langsung menggunakan PostgreSQL lokal yang mungkin juga dipakai project lain. Keuntungannya: versi database dapat dipin, data tersimpan dalam volume Docker, setup dapat diulang di komputer anggota tim lain, dan tidak mencampur database sistem yang berbeda.

pgAdmin tidak perlu ikut di Docker karena pengguna sudah memilikinya di Mac. Tambahkan koneksi:
- Host: `127.0.0.1`
- Port: `5433`
- Database: `simrs_dummy`
- User: `simrs_app`
- Password: dari `.env`

Compose mengikat port ke `127.0.0.1` agar database hanya terbuka untuk host lokal dalam konfigurasi development ini.

## Batas database antaraplikasi

- Database ini hanya untuk SIMRS Dummy.
- Web Monitoring/Robot Control nantinya memakai database/service tersendiri.
- Tidak perlu satu database bersama hanya untuk memudahkan integrasi. Pertukaran data antaraplikasi dilakukan melalui kontrak API/event yang disepakati.

## Kafka dan ROS 2

Kafka topic bukan ROS 2 topic. Kafka ditunda sampai event lintas aplikasi dan kebutuhan reliability ditetapkan. Kandidat nama event seperti `delivery.requested` hanya contoh konseptual, belum kontrak final. ROS 2 topics/actions diputuskan berdasarkan interface NEVO/ROS 2 dan perangkat robot.

## Versi dan validasi

Pilih versi yang saling kompatibel, commit lockfile, jalankan dokumentasi versi yang dipilih, dan hindari menginstal versi prerelease secara tidak sengaja. Jika agent menemukan ketidakcocokan versi, minta ia menyampaikan bukti dan opsi terlebih dahulu.
