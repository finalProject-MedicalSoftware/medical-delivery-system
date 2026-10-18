# Prompt untuk Antigravity — Bangun SIMRS Dummy

Gunakan prompt ini dari workspace root `medical-delivery-system/`. Jangan meminta agent membangun semua fitur dalam satu perubahan besar.

---

Anda bertindak sebagai senior full-stack engineer dan reviewer untuk prototipe akademik **SIMRS Dummy** dalam proyek Medical Delivery System.

## Sebelum mengubah file

1. Baca `simrs-dummy/AGENTS.md` dan `simrs-dummy/PRD_SIMRS_DUMMY.md` sampai selesai.
2. Baca `docs/simrs-dummy/STACK_DECISIONS.md` dan `README-DB-SETUP.md`.
3. Periksa struktur repository, status Git, package manager dan file yang sudah ada. Jangan menimpa file atau menghapus perubahan yang sudah dibuat user.
4. Ringkas pemahamanmu tentang scope, multi-role, workflow resep-farmasi-permintaan pengantaran, dan hal yang sengaja ditunda.
5. Berikan rencana implementasi bertahap serta daftar file utama yang akan dibuat/diubah. Jika ada kontradiksi, ajukan pertanyaan alih-alih mengarang keputusan.

## Baseline teknologi

Gunakan Next.js App Router + TypeScript, Tailwind CSS + shadcn/ui, PostgreSQL yang disiapkan dari root `compose.yaml`, Prisma ORM v7, Zod, Auth.js, unit/integration tests, dan Playwright untuk alur UI yang kritis. Verifikasi kompatibilitas versi dari dokumentasi yang sesuai sebelum instalasi; jangan memakai Prisma 8 RC atau dependency prerelease secara tidak sengaja.

## Batas yang wajib dipatuhi

- Buat SIMRS Dummy saja pada fase ini; jangan membangun Web Monitoring, HMI, WebSocket robot, Kafka, atau integrasi ROS 2 sekarang.
- Data seluruh pasien/staf/obat harus sintetis. Jangan gunakan data nyata.
- Database SIMRS harus terpisah dari database Web Monitoring yang akan dibuat pada fase berikutnya.
- Satu user bisa mempunyai banyak role. Implementasikan relasi many-to-many `User`–`Role`–`UserRole`, bukan `User.role` tunggal. Otorisasi dilakukan di server, bukan sekadar hide/show menu.
- Jangan mengklaim bahwa status mock adalah status robot nyata atau bukti serah-terima fisik.
- Belum ada kontrak final REST API ke Web Monitoring, Kafka topic, WebSocket payload, ataupun ROS 2 interface. Jangan mengarang dan mengunci kontrak itu.
- Jangan menjalankan `docker compose down -v`, drop database, reset database, atau operasi destruktif tanpa menjelaskan akibat dan meminta persetujuan terlebih dahulu.
- Jangan melakukan perubahan yang sekadar menonaktifkan lint/typecheck/test untuk membuat build tampak berhasil.

## Cara implementasi

Kerjakan dalam vertical slices:

**Slice 1 — Scaffold dan database**
- Buat struktur Next.js/TypeScript, styling, konfigurasi env, Prisma v7, skema awal minimum, migrations, dan seed.
- Pastikan database dari Compose dapat dijangkau aplikasi yang berjalan di host Mac melalui `localhost:5433`.
- Tambahkan lint, typecheck, test, dan build scripts yang benar-benar berfungsi.

**Slice 2 — Auth dan multi-role**
- Login/logout, model User/Role/UserRole, role/permission checks di server, proteksi halaman dan API.
- Sediakan seed akun demo yang jelas-jelas hanya lokal dan mendukung demonstrasi satu user dengan beberapa role. Hash password; tidak ada plaintext password tersimpan.
- Tulis test untuk izin yang diizinkan/ditolak dan untuk multi-role.

**Slice 3 — Master data dummy**
- Pasien sintetis, bangsal/ruang/tempat tidur, katalog obat. Field dan unique constraints mengikuti PRD.
- `room_code` harus stabil dan unik sesuai rancangan.

**Slice 4 — Resep dan farmasi**
- Draft/submitted, pharmacy verification/rejection, preparation, ready for delivery.
- Implementasikan state transition di server dan tes transisi valid maupun tidak valid.

**Slice 5 — Delivery request dan audit**
- Buat permintaan dari resep/obat yang memenuhi aturan readiness.
- Simpan identitas request stabil, `room_code`, pemohon, waktu, status, dan event/audit.
- Saat belum terintegrasi, tampilkan `PENDING_INTEGRATION`/mock secara jelas.

**Slice 6 — UX, tests, dan dokumentasi**
- Dashboard berbasis data, loading/empty/error/success states, responsive layout, Playwright untuk flow utama.
- Perbarui instruksi setup dan ringkasan hasil tes.

Mulai dengan Slice 1. Jangan melanjutkan ke seluruh slice secara otomatis jika implementasi dan pemeriksaan slice sebelumnya belum berhasil. Di akhir Slice 1, laporkan perubahan, command yang dijalankan, hasil nyata, dan langkah berikutnya.

## Kriteria pelaporan

- Nyatakan file yang dibuat/diubah.
- Cantumkan command tepat untuk menjalankan app/test.
- Bedakan test yang berhasil, gagal, atau tidak dijalankan.
- Jika terjadi error, jelaskan akar masalah yang ditemukan dan perbaikannya.
- Jika PRD atau AGENTS perlu berubah karena fakta teknis, usulkan perubahan yang spesifik dan alasannya; jangan diam-diam mengubah requirement.
