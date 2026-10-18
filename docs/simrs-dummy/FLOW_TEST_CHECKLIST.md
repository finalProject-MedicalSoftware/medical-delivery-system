# SIMRS Dummy — Checklist Uji Alur

Gunakan setelah implementasi tiap slice selesai. Catat hasil `PASS` / `FAIL` / `BLOCKED`, bukti, dan issue terkait.

## A. Environment dan DB
- [ ] Docker Desktop aktif.
- [ ] `docker compose up -d simrs-postgres` sukses.
- [ ] Healthcheck database sehat.
- [ ] pgAdmin dapat terhubung ke `localhost:5433`, database `simrs_dummy`.
- [ ] Migrations sukses pada database kosong yang baru.
- [ ] Seed dapat dijalankan ulang tanpa duplikasi yang tidak diinginkan.

## B. Login dan multi-role
- [ ] Login valid berhasil.
- [ ] Login invalid menampilkan pesan aman tanpa membocorkan detail internal.
- [ ] Route terlindungi meminta autentikasi.
- [ ] User yang hanya punya role dokter dapat melakukan tindakan dokter yang diizinkan.
- [ ] User tanpa permission farmasi tidak bisa mengakses aksi verifikasi farmasi melalui UI maupun request langsung.
- [ ] User multi-role mendapat gabungan permission yang dimaksud.
- [ ] Perubahan role tercatat pada audit trail.

## C. Data dummy
- [ ] CRUD pasien sintetis berfungsi sesuai permission.
- [ ] MRN/patient code unik.
- [ ] CRUD ruang berfungsi dan `room_code` duplicate ditolak.
- [ ] Katalog obat tampil berdasarkan database.
- [ ] Semua seed/pasien yang ditampilkan jelas merupakan data DEMO.

## D. Workflow resep
- [ ] Dokter membuat resep DRAFT.
- [ ] Resep dapat dikirim ke SUBMITTED.
- [ ] Farmasi dapat memverifikasi resep.
- [ ] Farmasi dapat menolak resep dengan alasan yang tersimpan.
- [ ] Role tidak berwenang tidak dapat memverifikasi resep melalui API langsung.
- [ ] Transisi status yang ilegal ditolak server dan diuji.

## E. Workflow pengantaran
- [ ] Obat/resep yang belum siap tidak bisa diajukan untuk delivery.
- [ ] Permintaan yang valid tersimpan dengan ID stabil dan `room_code`.
- [ ] Status awal jelas `DELIVERY_REQUESTED`/`PENDING_INTEGRATION`.
- [ ] Retry atau double click tidak membuat permintaan duplikat secara tidak terkendali.
- [ ] Audit/event menunjukkan siapa membuat dan mengubah status.
- [ ] UI tidak mengklaim robot sungguhan bergerak atau serah-terima fisik sudah terjadi.

## F. Kualitas final
- [ ] Lint.
- [ ] Typecheck.
- [ ] Unit/integration tests.
- [ ] Production build.
- [ ] Playwright critical workflow.
- [ ] Loading/empty/error states.
- [ ] Instruksi setup diperbarui.
