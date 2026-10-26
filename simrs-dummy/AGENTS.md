# AGENTS.md — SIMRS Dummy

## 1. Konteks proyek

Bangun aplikasi SIMRS Dummy untuk demonstrasi alur permintaan pengantaran obat ke ruang rawat inap. Aplikasi menggunakan data sintetis. Aplikasi ini bukan SIMRS klinis produksi, bukan pengganti penilaian tenaga kesehatan, dan belum terhubung ke SIMRS rumah sakit nyata maupun robot NEVO.

## 2. Batas arsitektur

- SIMRS Dummy adalah aplikasi dan domain data yang berdiri sendiri.
- Database SIMRS Dummy harus terpisah dari database Web Monitoring/Robot Control.
- Integrasi dengan Web Monitoring dan NEVO akan dilakukan pada fase berikutnya berdasarkan kontrak API/event yang disepakati. Jangan mengarang endpoint final, topic Kafka, format WebSocket robot, atau ROS 2 topic.
- Jangan menambahkan Kafka pada fase SIMRS awal. Jangan membuat dependensi langsung terhadap ROS 2.
- TIFA hanya referensi arsitektur. Jangan menyalin source code privat TIFA atau menganggap endpoint produksinya tersedia.
- Semua data pasien, resep, staf, dan obat untuk demo harus dibuat fiktif/sintetis. Jangan masukkan data pasien nyata.

## 3. Stack keputusan awal

- Next.js App Router dan TypeScript.
- React sesuai versi yang kompatibel dengan Next.js terpilih.
- Tailwind CSS dan shadcn/ui untuk UI.
- PostgreSQL dijalankan dengan Docker Compose dari root workspace.
- Prisma ORM v7 sebagai versi stabil awal, menggunakan migrations dan seed yang dapat diulang. Verifikasi dokumentasi dan kompatibilitas sebelum memperbarui major version.
- Zod untuk validasi request/form di server.
- Auth.js untuk autentikasi, dengan otorisasi dan pengecekan role/permission di server. Jangan mengandalkan penyembunyian tombol atau guard client saja.
- Unit/integration tests untuk aturan bisnis dan Playwright untuk alur kritis UI.
- Gunakan lockfile dan versi dependency yang konsisten; jangan memasang major version terbaru secara membabi buta.

Jika ada konflik versi atau kemampuan library, laporkan opsi serta dampaknya sebelum mengubah keputusan stack inti.

## 4. Multi-role adalah persyaratan wajib

Satu akun harus dapat memiliki lebih dari satu role sekaligus. Jangan memakai satu kolom `User.role` sebagai satu-satunya sumber role.

Gunakan model relasional minimal:
- `User`
- `Role`
- `UserRole` (relasi many-to-many; unique constraint gabungan user dan role)
- `Permission` dan `RolePermission` jika permission granular diperlukan
- audit trail untuk tindakan penting

Daftar role awal yang dapat dikembangkan:
- `SYSTEM_ADMIN`: operasi teknis dan administrasi akun/role.
- `SIMRS_ADMIN`: master data aplikasi dan konfigurasi domain.
- `DOCTOR`: membuat/meninjau simulasi order resep sesuai workflow.
- `NURSE`: melihat kebutuhan obat dan mengajukan/meninjau permintaan dari ruang rawat sesuai kebijakan.
- `PHARMACIST`: verifikasi resep dan validasi kesiapan obat.
- `PHARMACY_STAFF`: menyiapkan obat dan memperbarui status persiapan.
- `WARD_ADMIN`: mengelola data bangsal, ruang, dan tempat tidur dummy.

Role harus disimpan di database dan bisa ditetapkan lebih dari satu kepada user. Jangan hardcode satu role per akun. Seed boleh menyediakan akun demo dengan beberapa role untuk membuktikan perilaku multi-role, dengan kredensial lokal yang terdokumentasi dan tidak untuk produksi.

## 5. Domain dan workflow

- Cakupan domain hanya cukup untuk mendemonstrasikan jalur permintaan pengantaran obat; jangan membangun seluruh fungsi SIMRS rumah sakit.
- Data pasien/nomor rekam medis harus diberi label sintetis dan tidak mengikuti identitas orang nyata.
- Pisahkan pasien, bangsal/ruang/tempat tidur, katalog obat, resep dan item resep, permintaan pengantaran, serta audit/event.
- Buat state transition yang eksplisit dan divalidasi di server; jangan mengizinkan status berubah sembarangan.
- Bedakan status aplikasi dari status robot. Sebelum integrasi, status gerak robot hanya boleh disebut `SIMULATED`/`MOCK` atau label demo setara.
- `DELIVERED` tidak boleh diklaim sebagai bukti serah-terima fisik. Kedatangan robot dan serah-terima adalah peristiwa berbeda.
- Draf kontrak integrasi disimpan di `docs/simrs-dummy/` atau `docs/api-contracts/`; tandai draf dengan jelas, dan jangan menganggap kontrak final sudah diputuskan.

## 6. Keamanan dan kualitas

- Password harus di-hash menggunakan library password hashing yang terpelihara. Jangan simpan password plaintext.
- Lindungi route dan server action; periksa autentikasi, role, permission, serta kepemilikan/akses resource di server.
- Validasi semua input dan jangan mempercayai role dari client.
- Simpan secrets hanya di `.env`; jangan commit `.env`, token, kredensial, data dump sensitif, atau rahasia.
- Terapkan least privilege, foreign key, unique constraints, transaksi untuk operasi multi-tabel, penanganan error, dan audit trail.
- Jangan mencatat password, token, atau data sensitif ke log.
- Gunakan database migrations; jangan menjalankan perintah reset/destructive tanpa menjelaskan dampaknya dan memperoleh persetujuan user.
- Hindari tombol atau flow palsu yang terlihat selesai tapi tidak punya perilaku. Bila fitur belum terintegrasi, tampilkan sebagai simulasi yang jelas.
- Perhatikan aksesibilitas dasar, loading/empty/error state, validasi form, dan responsivitas.

## 7. Aturan kerja agent

1. Baca `AGENTS.md` ini dan `PRD_SIMRS_DUMMY.md` sebelum menulis kode.
2. Periksa isi repository dan status package yang ada sebelum membuat ulang/menghapus file.
3. Kerjakan secara incremental dalam vertical slices; jangan membangun semua modul sekali jalan tanpa tes.
4. Sebelum implementasi, tampilkan rencana pendek dan file utama yang akan disentuh.
5. Setelah perubahan, jalankan lint, typecheck, unit/integration tests, dan build yang tersedia. Nyatakan dengan jujur mana yang berhasil/gagal/tidak dijalankan.
6. Jangan menutupi kegagalan test. Jika ada error, cari akar masalah dan perbaiki penyebabnya, bukan hanya menonaktifkan test atau lint.
7. Jika ditemukan kebutuhan baru, bug flow, atau perubahan requirement, usulkan pembaruan PRD/AGENTS dan dokumentasikan alasan serta dampaknya. Jangan diam-diam mengubah kebutuhan inti.
8. Jangan mengubah/memigrasikan database nyata atau menghapus volume tanpa persetujuan.
9. Jangan menambah Kafka, WebSocket robot, ROS 2, HMI, atau fitur semantic perception ke aplikasi SIMRS pada fase awal.
10. Jangan menyebut sistem layak klinis/produksi; proyek ini prototipe akademik dengan data dummy.

## 8. Definition of done untuk setiap slice

- Alur sesuai PRD.
- Server-side authorization diuji untuk role yang diizinkan dan ditolak.
- Validasi input dan state transition diuji.
- Migrations dan seed dapat dijalankan ulang pada database lokal kosong sesuai dokumentasi.
- Loading, empty, success, dan error states tersedia untuk layar yang relevan.
- Lint, typecheck, test, dan build dijalankan atau keterbatasannya dicatat.
- Dokumentasi diperbarui untuk perubahan workflow, environment variable, dan langkah menjalankan aplikasi.
