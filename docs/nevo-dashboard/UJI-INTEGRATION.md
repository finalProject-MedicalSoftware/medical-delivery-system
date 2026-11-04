# UJI-INTEGRATION — Checklist Uji End-to-End Nevo

> Pola bukti acuan: G1–G4 di `docs/testing-postman-simrs-web-monitoring.md` (hasil e2e SIMRS → backend → Kafka → WS/BFF, `medical-ws/e2e.mjs`). Setiap fitur baru wajib punya bukti terdokumentasi.

## A. Integrasi web + SIMRS (prioritas pertama)

- [ ] SIMRS Dummy → outbox → relay webhook → backend tercatat di log (tidak menyentuh Kafka — aturan 8).
- [ ] Backend (`SimrsClientService` polling read-only) melayani data yang konsisten dengan data yang dikirim SIMRS.
- [ ] Dashboard (BFF/SSE) menampilkan event yang sama dengan log gateway — tidak ada data yang berbeda antara log dan UI.
- [ ] Mismatch kontrak/data/auth tersisa = seluruh 0; retry/dedupe berjalan sesuai diskusi.
- [ ] Label `[MOCK]`/`SIMULATED` muncul dari kode untuk semua data sintetis (aturan 1).

## B. Downlink & uplink robot

- [ ] **Uplink dulu** (aman, tanpa gerak fisik): `ROBOT_COMMAND_RESULT` dari datasheet/robot dummy → gateway → Kafka → broadcast WS → terlihat di SSE/BFF.
- [ ] **Downlink sim mode**: UI `/robots` teleop (tombol+WASD) → `ROBOT_COMMAND` → adapter `sim` → hasil terekam. **Tanpa fisik.**
- [ ] Backend konsumsi `ROBOT_COMMAND_RESULT` (setelah keputusan aturan 8) → `t_robot_command.result` terisi.
- [ ] Perintah fisik ke robot sungguhan = **terpisah, dengan izin owner** (prosedur README "Uji robot fisik") — selalu langkah terakhir.

## C. Sesi & token

- [ ] Turn On: log urutan `Connected → SI … → Session established as …` (pola verifikasi deploy).
- [ ] Turn Off: token dibuang; Turn On berikutnya fetch token baru (`TOKEN-FLOW.md`).
- [ ] Simulasi token expired: recycle Turn Off→Turn On mengembalikan sesi.
- [ ] Skenario duplikat: SI dobel → gateway close 4002; sesi zombie → kirim SI dengan `force:true` menendang sesi lama (close 4001). WAJIB tutup semua sesi WS Postman (UI & robot) sebelum Turn On.

## D. Monitoring & notifikasi (setelah skema `h_*` dibangun)

- [ ] Event battery/state/command/connection tercatat di tabel `h_*` dan muncul di halaman monitoring.
- [ ] Notifikasi per device + robot-ready toast berbasis event (filter dari DB, bukan hardcode).
- [ ] Tanpa hardcode port/URL/token (aturan 4): audit sederhana grep kredensial/URL di kode sebelum selesai.

## Aturan main saat menguji

1. Teleop/order perintah ke **robot fisik** hanya dengan izin owner — tanpa kecuali.
2. Data sintetis diberi label dari kode, bukan catatan manual.
3. Setiap pengubahan kontrak selama pengujian → jalankan kembali checklist terkait + perbarui Postman.
