# Product Requirements Document (PRD)
## SIMRS Dummy — Prototipe Workflow Permintaan Pengantaran Obat

**Versi:** 0.1 — draft awal untuk implementasi lokal  
**Status:** Baseline awal; kontrak integrasi ke Web Monitoring/NEVO belum final  
**Pemilik kebutuhan:** Tim Capstone Medical Delivery System

---

## 1. Ringkasan produk

SIMRS Dummy adalah aplikasi web simulasi yang menyediakan data dan workflow dasar rumah sakit untuk mendukung demonstrasi permintaan pengantaran obat ke ruang rawat inap. Aplikasi memuat data sintetis pasien, staf, obat, bangsal/ruang, resep simulasi, persiapan obat, dan permintaan pengantaran.

Aplikasi ini akan berdiri sendiri dengan database PostgreSQL tersendiri. Pada fase awal, fokusnya memastikan alur bisnis dan data berjalan secara konsisten tanpa mengandalkan robot. Integrasi ke Web Monitoring/Robot Control dan NEVO akan dirancang kemudian menggunakan kontrak API dan status yang disepakati. Pergerakan robot dalam pengujian SIMRS awal harus dilabeli sebagai simulasi/mock, bukan kejadian robot nyata.

## 2. Latar belakang dan masalah

Proyek membutuhkan representasi alur sistem informasi rumah sakit agar permintaan pengantaran obat dapat dibuat dari sisi aplikasi dan nantinya diteruskan ke aplikasi monitoring robot. SIMRS rumah sakit nyata memiliki batas akses dan privasi; karena itu, prototipe menggunakan data fiktif dan tidak terhubung ke database atau layanan rumah sakit sebenarnya.

## 3. Tujuan

1. Menyediakan workflow dummy dari resep simulasi hingga permintaan obat siap dikirim ke ruang rawat inap.
2. Menyediakan identitas ruang yang konsisten, terutama `room_code`, agar dapat dipetakan ke titik navigasi pada Web Monitoring kelak.
3. Menerapkan multi-role yang benar-benar mendukung satu akun memiliki beberapa role.
4. Menyediakan audit status yang dapat ditelusuri untuk kebutuhan pengujian dan debugging.
5. Menyiapkan aplikasi dan dokumen agar kontrak integrasi selanjutnya dapat dinegosiasikan dengan tim Web Monitoring dan ROS 2.

## 4. Di luar cakupan

- Integrasi langsung ke SIMRS rumah sakit nyata, data pasien nyata, API rumah sakit, atau rekam medis elektronik produksi.
- Diagnosis, rekomendasi klinis, clinical decision support, atau validasi terapi medis.
- Klaim kepatuhan sebagai sistem klinis/produksi.
- Implementasi seluruh modul SIMRS seperti billing, asuransi, laboratorium, radiologi, rawat jalan lengkap, dan rekam medis komprehensif.
- Pengendalian robot atau komunikasi langsung dengan ROS 2 dari SIMRS Dummy.
- Finalisasi WebSocket protocol, Kafka topics, ROS 2 topics/actions, atau endpoint integrasi eksternal pada fase pertama.
- Verifikasi serah-terima obat secara fisik. Status sampai di tujuan tidak membuktikan penerima telah mengambil obat.

## 5. Pengguna dan multi-role

Role berbasis database dan harus mendukung relasi many-to-many antara user dan role. Satu akun boleh mempunyai beberapa role, dan akses efektif akun adalah gabungan permission yang diberikan oleh role-role tersebut, kecuali aturan deny khusus nantinya ditambahkan.

### 5.1 Role awal

| Role | Tanggung jawab utama | Batasan contoh |
|---|---|---|
| `SYSTEM_ADMIN` | Administrasi teknis, akun dan konfigurasi akses | Akses sensitif harus tercatat di audit log |
| `SIMRS_ADMIN` | Mengelola master data dummy dan konfigurasi aplikasi | Tidak otomatis memperoleh izin melakukan semua tindakan klinis jika permission dipisahkan |
| `DOCTOR` | Membuat dan mengirim resep simulasi untuk pasien dummy | Tidak mengelola akun/role kecuali memperoleh role tambahan |
| `NURSE` | Melihat data perawatan yang dibutuhkan dan membuat/meninjau permintaan pengantaran sesuai aturan workflow | Tidak memverifikasi resep sebagai farmasi kecuali juga memiliki role terkait |
| `PHARMACIST` | Meninjau/verifikasi resep, menolak dengan alasan, memastikan obat siap diproses | Tidak boleh mengubah audit trail lama |
| `PHARMACY_STAFF` | Memperbarui proses persiapan dan kesiapan obat | Tidak otomatis dapat mengubah resep dokter |
| `WARD_ADMIN` | Mengelola bangsal, ruang, dan tempat tidur dummy | Tidak mengubah status resep/obat tanpa permission terkait |

Role tersebut adalah baseline, bukan klaim bahwa pembagian ini merupakan SOP suatu rumah sakit tertentu. Nama role, akses dan workflow bisa disesuaikan bersama pembimbing/pemilik kebutuhan.

### 5.2 Persyaratan multi-role

- Model relasi minimal: `User`, `Role`, `UserRole`.
- Hindari satu kolom `role` tunggal pada `User` sebagai sumber kebenaran.
- Berikan UI untuk melihat role yang ditetapkan kepada user dan untuk menambah/mencabut role oleh administrator yang diizinkan.
- Otorisasi harus diperiksa di server pada route/API/server actions, bukan hanya dengan menyembunyikan menu di UI.
- Uji user yang memiliki lebih dari satu role, perubahan role, akses yang diizinkan dan ditolak.

## 6. Alur bisnis utama

### 6.1 Workflow resep ke permintaan pengantaran

1. Dokter memilih pasien sintetis dan membuat resep simulasi dengan satu atau lebih item obat.
2. Dokter menyimpan draft atau mengirim resep untuk ditinjau.
3. Farmasis memeriksa resep dummy, lalu memverifikasi atau menolak dengan alasan yang tercatat. Ini adalah simulasi workflow, bukan rekomendasi medis.
4. Staf farmasi memperbarui status persiapan obat menjadi sedang diproses dan siap untuk pengantaran.
5. Peran yang diizinkan (farmasi dan/atau perawat sesuai aturan konfigurasi yang disepakati) membuat permintaan pengantaran dari resep/obat yang siap.
6. Permintaan mencatat pasien sintetis, item obat yang relevan, `room_code`, waktu, pemohon, serta identitas unik permintaan.
7. Pada rilis awal, permintaan tampil dengan status lokal `DELIVERY_REQUESTED` atau `PENDING_INTEGRATION`. Tidak ada klaim robot sudah bergerak.
8. Mode mock opsional boleh mensimulasikan perubahan status lanjutan, tetapi setiap status harus diberi label demo/mock dengan jelas dan dicatat sebagai event simulasi.
9. Pada fase integrasi, Web Monitoring akan menerima data yang disepakati, menautkan `room_code` ke goal aktif, dan menjadi sumber status robot. Kontrak ini belum final dalam PRD versi ini.

### 6.2 State awal yang diusulkan

**Prescription:** `DRAFT` → `SUBMITTED` → `VERIFIED` atau `REJECTED` → `PREPARING` → `READY_FOR_DELIVERY`. Transisi yang diperbolehkan harus dikodekan eksplisit dan dibatasi berdasarkan permission.

**Delivery request (SIMRS-side):** `DELIVERY_REQUESTED` → `PENDING_INTEGRATION`. Status integrasi selanjutnya seperti `ACCEPTED_BY_MONITORING`, `IN_TRANSIT`, atau `ARRIVED_AT_ROOM` baru ditambahkan setelah kontrak dengan Web Monitoring ditetapkan. Dalam mock mode, prefiks atau metadata simulasi harus jelas.

Pembatalan dan kegagalan perlu menyimpan alasan, waktu, pelaku, serta event sebelum status terminal. Jangan membolehkan user mengubah status secara bebas tanpa aturan.

## 7. Fitur fungsional

### F-01. Login dan akses berbasis role
- Login/logout dengan password yang di-hash.
- Route terproteksi.
- User dapat memiliki beberapa role.
- Sistem memeriksa permission di sisi server.
- Akun demo dan cara login lokal didokumentasikan; tidak ada password demo untuk produksi.

### F-02. Dashboard SIMRS
- Ringkasan resep berdasarkan status.
- Ringkasan permintaan pengantaran berdasarkan status.
- Akses cepat ke modul sesuai role.
- Angka dashboard berasal dari database, bukan angka hardcode.

### F-03. Master pasien sintetis
- CRUD atau pengelolaan pasien sesuai permission.
- Gunakan patient code/MRN sintetis yang unik.
- Nama dan data demografis adalah fiktif; hindari pola yang sengaja meniru pasien nyata.
- Tandai tampilan/data sebagai DEMO/SYNTHETIC.

### F-04. Master bangsal, ruang, dan tempat tidur
- Menyimpan bangsal, `room_code`, nama ruang, dan tempat tidur jika diperlukan untuk demo.
- `room_code` harus unik dalam domain yang disepakati dan stabil agar kelak dapat dipetakan ke goal navigasi.
- Jangan simpan koordinat robot sebagai sumber data SIMRS utama. Koordinat dan peta dimiliki domain Web Monitoring, yang nantinya memiliki mapping `room_code` ke goal aktif.

### F-05. Katalog obat dummy
- Daftar obat sintetis/untuk demo, satuan, dan status aktif.
- Stok demo sederhana boleh dipakai untuk memblokir persiapan ketika stok tidak cukup, apabila implementasi tidak memperluas cakupan terlalu jauh.
- Tidak memberikan rekomendasi dosis atau keputusan terapi.

### F-06. Resep simulasi
- Membuat/mengedit draft, mengirim untuk verifikasi, verifikasi/penolakan oleh farmasi, dan perubahan status persiapan.
- Simpan item obat, kuantitas, catatan dummy, pembuat dan timestamp.
- Validasi bahwa pasien dan item yang dipilih ada/aktif.
- Simpan alasan untuk penolakan/perubahan penting.

### F-07. Permintaan pengantaran
- Buat permintaan dari item/resep yang memenuhi status kesiapan.
- Simpan identitas request yang stabil (misalnya UUID), patient code sintetis, dan `room_code`.
- Tampilkan status permintaan dan riwayat perubahannya.
- Hindari membuat dua permintaan identik tanpa mekanisme konfirmasi/deteksi duplikasi.
- Pada fase pertama, data disimpan di SIMRS Dummy; jangan mengirim langsung ke NEVO.

### F-08. Audit trail
- Catat siapa mengubah status/record, kapan, tipe aksi, entitas dan identifier, serta perubahan status yang relevan.
- Audit hanya append untuk tindakan aplikasi normal; tidak menyediakan tombol edit/delete audit log.
- Jangan mencatat password, token, atau secret.

### F-09. Seed dan data demo
- Sediakan seed untuk role, permission, user contoh, bangsal/ruang, pasien sintetis, katalog obat, dan satu contoh workflow.
- Seed aman dijalankan ulang tanpa menghasilkan duplikasi tak terkendali.
- Kredensial demo hanya untuk development lokal dan harus diganti/dinonaktifkan sebelum deployment yang dibuka ke jaringan.

## 8. Halaman minimum

1. Login.
2. Dashboard.
3. Pengguna dan penetapan multi-role (administrator berwenang).
4. Pasien sintetis.
5. Bangsal/ruang/tempat tidur.
6. Katalog obat.
7. Daftar dan detail resep dengan tindakan sesuai permission.
8. Daftar dan detail permintaan pengantaran.
9. Riwayat/audit yang dapat diakses sesuai permission.
10. Halaman bantuan/status sistem yang menjelaskan bahwa sistem sedang berjalan dalam mode dummy.

Navigasi harus menampilkan menu yang relevan untuk user, namun perlindungan sesungguhnya tetap dilakukan oleh server.

## 9. Data model awal

Nama tabel dan detail field final ditentukan dalam Prisma schema. Model kandidat:

- `User`, `Role`, `UserRole`, `Permission`, `RolePermission`.
- `Patient`.
- `Ward`, `Room`, `Bed` (Bed boleh dikecilkan jika tidak diperlukan oleh skenario demo).
- `Medicine` dan opsional `MedicineStock`/`MedicineBatch` untuk simulasi stok sederhana.
- `Prescription`, `PrescriptionItem`.
- `DeliveryRequest`, `DeliveryEvent`.
- `AuditLog`.

Gunakan ID internal (UUID atau ID yang konsisten), timestamp yang jelas, foreign key, unique constraints, dan transaksi pada perubahan beberapa entitas. `room_code` harus unik. Jangan mencampur skema robot/WebSocket dari TIFA pada database SIMRS.

## 10. Stack dan pelaksanaan

Stack baseline:
- Next.js App Router + TypeScript.
- Tailwind CSS + shadcn/ui.
- PostgreSQL (container Docker lokal).
- Prisma ORM v7 dan migrations.
- Zod untuk schema validation.
- Auth.js dengan validasi kredensial/identitas pada server dan session strategy yang sesuai.
- Unit/integration testing untuk domain/otorisasi; Playwright untuk alur end-to-end kritis.

Gunakan versi dependency yang saling kompatibel dan lockfile. Jangan upgrade major/RC tanpa alasan dan persetujuan.

## 11. Persyaratan nonfungsional

- Data sintetis saja; banner/indikator DEMO terlihat.
- UI responsif untuk laptop dan tablet.
- Loading, empty, error, validation, success state jelas.
- Password di-hash; authorization server-side; validasi input.
- Prisma migrations, seed yang repeatable, serta langkah setup yang dapat direproduksi.
- Error tidak menampilkan secret atau stack trace sensitif kepada pengguna.
- Audit untuk perubahan penting.
- Konfigurasi lokal di `.env`, tidak ada secrets di Git.
- Tidak ada direct browser-to-robot connection.
- Perubahan status bisnis diuji dan tidak dapat dilakukan secara arbitrer.

## 12. Testing dan acceptance criteria

### A. Database/setup
- PostgreSQL hidup via `docker compose up -d simrs-postgres`.
- pgAdmin dapat mengakses `localhost:5433`.
- Fresh setup dapat menjalankan migrations dan seed sesuai README setup.
- Tidak ada secrets ter-commit.

### B. Multi-role dan authorization
- User dengan dua role memperoleh permission gabungan yang dirancang.
- User tanpa role yang dibutuhkan mendapat respons unauthorized/forbidden yang tepat.
- Memanipulasi client request tidak dapat melewati pemeriksaan server.
- Perubahan role tercatat di audit.

### C. Workflow utama
- Dokter membuat resep dummy, mengirimnya, dan resep muncul pada antrean farmasi.
- Farmasis dapat memverifikasi atau menolak sesuai permission; alasan penolakan tersimpan.
- Staf farmasi dapat memperbarui status persiapan secara valid.
- Permintaan pengantaran hanya dapat dibuat untuk resep/obat yang memenuhi aturan readiness.
- Permintaan mencantumkan `room_code`, ID stabil, waktu, pemohon, dan riwayat status.
- Perubahan status ilegal ditolak oleh server dan diuji.
- SIMRS menampilkan status sebagai menunggu integrasi/mock; tidak mengaku telah menggerakkan robot.

### D. Kualitas
- Lint, typecheck, test, dan build sukses, atau kegagalan/hal yang belum dapat dijalankan didokumentasikan.
- Tidak ada tautan/tombol utama yang dead-end tanpa pesan.
- Error dan empty states diuji.

## 13. Risiko dan keputusan yang masih terbuka

- Pembagian hak dokter, perawat, farmasi, dan admin perlu disetujui terhadap skenario demo yang dipilih; role-role di PRD merupakan usulan awal.
- Apakah data stok obat diperlukan dalam demo awal masih bisa diperkecil jika menghambat workflow inti.
- Endpoint API, auth antar aplikasi, event payload, Kafka topics, dan WebSocket commands akan dirancang bersama Web Monitoring setelah workflow diketahui.
- Cara `room_code` dipetakan ke goal/peta aktif adalah tanggung jawab batas integrasi Web Monitoring; format final belum ditentukan.
- Status `ARRIVED_AT_ROOM` hanya menyatakan hasil navigasi apabila dikonfirmasi oleh sumber robot yang sah. Status serah-terima fisik memerlukan mekanisme tersendiri dan bukan bagian scope saat ini.

## 14. Prioritas implementasi bertahap

1. Scaffold, environment, database connection, migrations, seed, lint/typecheck/build.
2. User, roles, multi-role assignment, authentication, server-side authorization dan tests.
3. Master data sintetis (pasien, ruang, obat).
4. Resep dan workflow farmasi dengan state transition.
5. Permintaan pengantaran dan audit trail.
6. Dashboard dan UX final untuk alur utama.
7. Unit/integration/e2e tests, perbaikan bug, dokumentasi, dan data reset lokal yang aman.
8. Setelah SIMRS stabil, susun kontrak integrasi dengan Web Monitoring; jangan mengimplementasikan kontrak spekulatif terlebih dahulu.
