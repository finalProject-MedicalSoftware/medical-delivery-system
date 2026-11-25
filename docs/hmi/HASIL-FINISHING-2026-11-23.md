# Hasil finishing HMI NEVO — 2026-11-23 (Claude Code)

Lanjutan dari `docs/hmi/HANDOFF-CLAUDE-CODE.md`. Semua di bawah benar-benar dijalankan. Stack berjalan di Docker Desktop 29.8.1.

## 1. Status T1–T7

| Tugas | Status | Perintah / bukti | Ringkasan |
|---|---|---|---|
| T1 SIMRS di Docker | **lolos** (dengan 1 perbaikan konfigurasi) | `docker compose --profile apps --profile ws build simrs-web simrs-relay medical-ws` → exit 0; `npx tsc --noEmit --tsBuildInfoFile /tmp/tsc.tsbuildinfo` (di container) → 0 error; `npx vitest run` → **15 file, 84/84 lolos**; `npm run lint` → 0 error, 1 warning lama; `next build` (di image) → 17 halaman | Lihat §2 untuk perbaikan env QR |
| T1.4 uji manual | **lolos** | `GET /api/v1/monitoring/active-deliveries` (header `x-monitoring-token`) → 200, 2 pengantaran, field `hmi` = `{patient:{mrnHash,initials,allergies}, scheduleUrl}`; `scheduleUrl` memakai IP LAN `192.168.77.147`. `/jadwal/<code>?t=<token>` valid → jadwal tampil; token diubah 1 karakter atau tanpa token → "Tautan jadwal tidak berlaku" tanpa data pasien. `/pasien/<id>/gelang?format=thermal` dan `?format=a4` → 200, band 270×25 mm + Code 128 + QR + pita alergi (dicek lewat screenshot) | – |
| T2 visual HMI | ditunda | – | Belum dikerjakan di sesi ini |
| T3 aset Android | ditunda | – | `android/app/src/main/assets/public` (build lama) sudah dihapus. Jalankan `npm run android:apk`, yang juga membangun ulang aset |
| T4 medical-ws | sebagian | `npm test` (host) → check.js dan frames-check lolos; image dibangun ulang, container **healthy** | Uji manual `HMI_REPORT` → `HMI_REPORT_ACK` + Kafka belum |
| T5 robot diagnostic node | **gagal / harus dikerjakan ulang** | – | Perubahan Desktop pada `robot/src/nevo_diagnostic_node` hilang saat folder `robot/` dihapus (belum di-commit). Spesifikasi untuk membuat ulang ada di `docs/REFERENSI-ROBOT-TIFA.md` |
| T6 jalur `BRIEF` | menunggu keputusan Rayhan | – | Belum ada jalur nyata SIMRS → tablet. Opsi belum ditulis |
| T7 relay `HMI_REPORT` di bridge robot | dicatat | – | Masuk daftar dev robotik |

Verifikasi HMI sebelum langkah di atas: `tsc --noEmit` 0 error, vitest **17 file, 87/87 lolos** (host).

## 2. File yang diubah dan alasannya

- `simrs-dummy/compose.yaml`:
  - `simrs-web` sekarang meneruskan `QR_BASE_URL`, `QR_SIGNING_SECRET`, `QR_TOKEN_TTL_SECONDS`, `SCHEDULE_TOKEN_TTL_SECONDS` (semuanya opsional, default kosong).
  - Port memakai `${SIMRS_WEB_BIND:-127.0.0.1}`.
  - Alasan: sebelumnya env QR tidak sampai ke container, sehingga link `/jadwal` jatuh ke `NEXTAUTH_URL=localhost` dan tidak bisa dibuka HP keluarga (T1.3).
- `simrs-dummy/.env.example`: menambah `QR_BASE_URL=` dan `SIMRS_WEB_BIND=`.
- `simrs-dummy/.env` (lokal, tidak di-commit): `QR_BASE_URL=http://192.168.77.147:3000`. Cek ulang IP dengan `ipconfig getifaddr en0` bila jaringan berganti.

## 3. Error/peringatan lama (tidak diperbaiki)

- `src/components/Select.tsx:41`: `'required' is defined but never used` (lint warning).
- Build: peringatan Edge Runtime dari `jose` (`CompressionStream`) lewat `src/lib/session.ts`.
- `next lint` deprecated (Next.js 16).
- `tsc` di container gagal menulis `tsconfig.tsbuildinfo` (user `nextjs` read-only). Gunakan `--tsBuildInfoFile /tmp/...`.
- Data uji pasien `MRN-TESTING-001` memakai nama asli, padahal aturan 1 AGENTS.md meminta data sintetis. Disarankan diganti nama fiktif.
- Field `allergies` berisi teks `"Alergi"`. Kemungkinan isian contoh, perlu dicek di data pasien.

## 4. Checklist uji manual (untuk Rayhan)

- [x] A. Otomatis: HMI 87/87, medical-ws lolos, SIMRS tsc + vitest 84/84 (di Docker)
- [ ] B. Simulator HMI: demo gelang cocok/tidak cocok, Ulangi/Belum paham, kuis, ringkasan + QR, mode perawat
- [ ] C. Kiosk `?view=face&state=BOOTING|ERROR|ARRIVED`
- [x] D1. Cetak gelang thermal/A4 (halaman tampil; cetak fisik belum)
- [ ] D2. Pindai gelang dengan scanner / kamera tablet
- [ ] D3. Buka QR `/jadwal` dari HP: set `SIMRS_WEB_BIND=0.0.0.0` di `simrs-dummy/.env`, lalu `docker compose --profile apps --profile ws up -d simrs-web`
- [ ] E. Robot `checks[]`: menunggu diagnostic node dibuat ulang (T5)
- [ ] F. Tablet nyata (APK, izin kamera)

## 5. Redesain gelang + uji scan HMI (2026-11-23, lanjutan)

Perubahan SIMRS:
- `src/components/Wristband.tsx`: gelang 279 x 25 mm ala gelang RS. Warna dasar biru (laki-laki) atau merah muda (perempuan). Kancing pengunci, lubang penyetel, panel label putih berisi QR 22 mm, identitas, dan Code 128. Penanda merah ALERGI dan jingga KEWASPADAAN INFEKSI.
- `src/lib/wristband-data.ts`: data gelang bersama untuk pratinjau dan cetak. QR SVG dengan koreksi galat L (modul lebih besar). Isi kode tidak berubah: QR `/scan/{mrn}?t=…`, Code 128 = MRN.
- `src/app/cetak/gelang/[id]/page.tsx` dan `src/components/AutoPrint.tsx`: halaman cetak tanpa layout aplikasi, dialog cetak terbuka otomatis.
- `src/app/(app)/pasien/[id]/gelang/page.tsx`: pratinjau 80%, tombol Cetak membuka halaman cetak.

Penyebab gelang berlipat saat dicetak ke PDF: halaman lama memakai `visibility:hidden` + `position:fixed` di dalam layout aplikasi. Chrome mencetak elemen fixed di setiap halaman. Sekarang PDF **1 halaman**: termal 279 x 25 mm (MediaBox 791 x 71 pt), A4 landscape.

Verifikasi:
- Docker rebuild lolos, `tsc` 0 error, lint tanpa error baru.
- `BarcodeDetector` Chrome membaca QR dan Code 128 dari render gelang. Hash MRN = `mrnHash` dari API SIMRS dan brief demo HMI.
- **HMI end-to-end, kamera palsu berisi foto gelang, mode `?view=face&state=ARRIVED`:**
  - gelang `SYN-MRN-001` (B.S.) → "Gelang cocok · Terima kasih, B.S." → kartu alergi Ibuprofen, dalam ±4 detik setelah kamera aktif;
  - gelang `MRN-TESTING-001` → "Gelang tidak cocok · Obat ini bukan untuk gelang tersebut. Perawat akan membantu."
