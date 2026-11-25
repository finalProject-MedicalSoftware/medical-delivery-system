# Handoff ke Claude Code — finishing HMI NEVO sebelum testing

Dokumen ini meneruskan pekerjaan dari sesi Claude (chat) ke Claude Code.
Baca dulu `AGENTS.md` di root repo; aturannya mengikat (data sintetis saja,
tanpa port/URL/token hardcode, secret hanya di `.env`, token di header,
kontrak = sumber kebenaran, perubahan kontrak dicatat, log token hanya 4
karakter awal, Kafka hanya di medical-ws, handover hanya oleh manusia).

Lingkungan: semua service jalan di **Docker**. Jangan commit/push kecuali
diminta. Jangan hapus file; kalau perlu, pindahkan ke `_to_delete/`.

---

## 1. Yang sudah dikerjakan (jangan dikerjakan ulang)

Fitur 1–8 (scan gelang, Ulangi/Belum paham, teach-back di akhir, ringkasan
jadwal + QR keluarga, laporan ke dashboard, layar status/INIT, peringatan
alergi, mode perawat). Ringkasan kontrak lengkap: `docs/api-contracts/hmi.md` §10.

| Area | File utama |
|---|---|
| HMI identitas | `medical-hmi/src/identity/{sha256,wristband,WristbandScan}.ts(x)` |
| HMI alur | `medical-hmi/src/meds/{timeline,quiz,types}.ts`, `src/Stage.tsx`, `src/present/{Panels.tsx,report.ts}` |
| HMI status & perawat | `src/states/machine.ts` (state BOOTING, parseInit), `src/status/RobotStatus.tsx`, `src/nurse/NurseMode.tsx` |
| HMI demo | `src/sim/{demo,stateFrames,Simulator}.ts(x)`, `scripts/sample-brief.json` |
| medical-ws | `src/core/hmi-report.js` (baru), `src/ws/router.js` (`handleHmiReport`), tes di `scripts/check.js` |
| SIMRS | `src/lib/{schedule-token,hmi-brief}.ts` (+test), `src/app/jadwal/[code]/page.tsx`, `src/app/(app)/pasien/[id]/gelang/page.tsx` (thermal/A4), `api/v1/monitoring/active-deliveries/route.ts` (field `hmi`), `src/middleware.ts` (`/jadwal` publik), `.env.example` |
| Robot | `robot/src/nevo_diagnostic_node/` (`checks[]` di INIT via `systemctl is-active`), `config/diagnostic_params.yaml`, README |

Status verifikasi:
- HMI: `tsc --noEmit` OK, vitest **87/87** lolos, QA visual headless OK.
- medical-ws: `npm test` lolos.
- SIMRS: hanya `hmi-brief.test.ts` (5/5) yang sudah dijalankan; **typecheck,
  tes penuh, lint, dan build belum** (install di VM gagal).
- Robot: JSON INIT dicek dengan harness g++; **`colcon build` belum**.

---

## 2. Tugas Claude Code (urut)

### T1 — Verifikasi SIMRS di Docker
1. Rebuild container SIMRS; jalankan `npm ci`, `npx prisma generate`,
   `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build`.
2. Perbaiki error yang berasal dari file baru/diubah di tabel di atas.
   Error lama yang tidak terkait: catat saja, jangan diperbaiki diam-diam.
3. Pastikan env `QR_BASE_URL` (atau `NEXTAUTH_URL`) berisi **IP LAN host**,
   bukan `localhost`, supaya QR `/jadwal` bisa dibuka dari HP keluarga.
   Tambahkan `SCHEDULE_TOKEN_TTL_SECONDS` ke `.env` lokal bila perlu (jangan commit `.env`).
4. Uji manual: buka `/pasien/<id>/gelang?format=thermal` dan `?format=a4`,
   `/jadwal/<code>?t=<token>` (valid → tampil; token diubah 1 karakter → ditolak),
   dan `GET /api/v1/monitoring/active-deliveries` → ada field `hmi`.

### T2 — Cek visual HMI (2 perbaikan terakhir belum dicek visual)
- `.hmiPanel` di `src/styles.css` kini `left: calc(30cqmin + 3%)` agar tidak
  tertutup gelembung wajah kiri atas. `cqmin` bergantung pada `.stage-root
  { container-type: size }`; pastikan panel memang berada di dalamnya. Kalau
  tidak, ganti ke `vmin`.
- Teks "Terima kasih, B.S." harus satu titik (bukan "B.S..").
- Cek di 1280×800 dan 1920×1200: `?view=face&state=ARRIVED` lalu jalankan
  demo; `state=BOOTING`; `state=ERROR`. Kolom nama obat di tabel ringkasan
  tidak boleh terpotong.

### T3 — Build ulang aset Android
`medical-hmi/android/app/src/main/assets/public/` masih berisi build lama.
Jalankan `npm install --legacy-peer-deps && npm run build && npx cap sync android`
(atau `npm run android:apk`). Pastikan izin kamera ada di `AndroidManifest.xml`
(`android.permission.CAMERA`) karena scan gelang memakai kamera depan.

### T4 — medical-ws di Docker
Rebuild image, `npm test`. Uji dengan `scripts/fake-robot.mjs` + sesi UI:
kirim `HMI_REPORT` dari sesi SI UI → harus dapat `HMI_REPORT_ACK`, frame
muncul di topic Kafka robot-events, dan **tidak** sampai ke socket robot.
Laporan dengan field salah (`replays:-1`) → `ERROR INVALID_REPORT`.

### T5 — Robot (diagnostic node)
`colcon build --packages-select nevo_diagnostic_node`, jalankan node, lalu
`ros2 topic echo /nevo/ws_out` → INIT berisi `mode`, `elapsed_sec`,
`timeout_sec`, `checks[]`. Uji `systemctl stop <nav_service>` → state
INACTIVE (dan FAILED bila `require_service: true`).

### T6 — CELAH PENTING: siapa yang mengirim `BRIEF` ke tablet? (laporkan, jangan putuskan sendiri)
Hasil grep: frame `BRIEF` saat ini **hanya** dibuat oleh
`medical-hmi/scripts/fake-robot.mjs`. Tidak ada di medical-backend, medical-ws,
atau kode robot. Artinya field `patient` + `scheduleUrl` dari SIMRS
(`active-deliveries[].hmi`) belum punya jalur nyata ke tablet.
- Telusuri dan tulis opsi (mis. bridge robot menarik dari SIMRS, atau
  medical-ws/backend menyusun BRIEF saat ARRIVED), dengan kelebihan dan
  kekurangan masing-masing.
- **Jangan implementasi tanpa persetujuan Rayhan**, karena ini perubahan
  kontrak/arsitektur (AGENTS.md aturan 6).
- Pastikan `fake-robot.mjs` mengirim `patient` + `scheduleUrl` dari
  `scripts/sample-brief.json` supaya demo end-to-end tetap jalan.

### T7 — Celah robot kedua (catat saja)
Jalur WS lokal robot (port 8765): bridge robot harus me-relay `HMI_REPORT`
ke gateway. Belum ada; masukkan ke daftar untuk dev robotik.

---

## 3. Output yang diminta dari Claude Code

Tulis `docs/hmi/HASIL-FINISHING-<tanggal>.md` berisi:
1. Tabel T1–T7: status (lolos/diperbaiki/gagal/ditunda), perintah yang
   dijalankan, dan ringkasan output.
2. Daftar file yang diubah beserta alasannya.
3. Error lama yang ditemukan tapi tidak diperbaiki.
4. Opsi untuk T6 (menunggu keputusan).
5. Checklist testing manual akhir untuk Rayhan (lihat §4), ditandai mana
   yang sudah dicoba di Docker.

File ini akan dipakai sebagai bahan laporan capstone, jadi tulis faktual:
angka tes, versi, dan apa yang benar-benar dijalankan.

---

## 4. Alur testing manual (untuk Rayhan setelah finishing)

A. **Otomatis:** `npm test` di medical-hmi dan medical-ws; tsc + vitest di SIMRS.

B. **Simulator HMI:** jalankan demo.
   1. Klik "Scan gelang (pasien lain)" dua kali → alur terkunci dan perawat dipanggil.
   2. Ulangi demo, klik "Scan gelang (cocok)". Urutan yang harus muncul:
      kartu alergi → langkah obat (uji Ulangi dan Belum paham dua kali) →
      kuis → ringkasan + QR → `PRESENT_DONE` + `HMI_REPORT`.
   3. Mode perawat: tekan lama pojok kanan atas 2 detik, masukkan PIN 1234.

C. **Kiosk:** `?view=face&state=BOOTING`, `state=ERROR`, `state=ARRIVED`.

D. **SIMRS:**
   1. Cetak gelang thermal/A4.
   2. Pindai dengan scanner USB atau kamera tablet.
   3. Buka QR `/jadwal` dari HP.

E. **Robot:** INIT `checks[]` lewat `ros2 topic echo`; matikan dan nyalakan
   layanan navigasi.

F. **Tablet nyata:** pasang APK, izinkan kamera, ulangi B dengan gelang hasil cetak.
