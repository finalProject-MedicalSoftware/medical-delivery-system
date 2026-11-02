# Status Implementasi NEVO Web Monitoring

**Tanggal evaluasi awal:** 20 Oktober 2026  
**Pembaruan integrasi:** 31 Oktober 2026  
**Baseline Proyek:** `medical-dashboard-monitoring/`  
**Target:** PRD NEVO Web Monitoring & Scaffold v2 (SIMRS Dummy Public Integration)

---

## Status integrasi lintas-komponen (31 Oktober 2026)

| Alur/komponen | Status | Bukti atau batas klaim |
|---|---|---|
| Backend REST + adapter simulator | Tersedia | Empat command tersedia pada jalur sim; bukan bukti ROS/Gazebo atau hardware. |
| SIMRS Dummy outbox + webhook relay | Tersedia | Relay memakai callback/env; acceptance SIMRS live belum dibuktikan di sini. |
| Backend → `medical-ws` HTTP bridge → Kafka `simrs.delivery.events.v1` → WS | Diimplementasi | Kafka tetap dimiliki gateway; direct produce Kafka dari backend belum dilakukan. |
| Dashboard BFF/SSE | Tersedia | WS URL berasal dari konfigurasi env; E2E lintas layanan perlu dicatat dengan Postman. |
| E2E SIMRS → backend → Kafka → BFF/SSE → dashboard | Perlu verifikasi terintegrasi | Jalankan Postman collection; simpan hasil tanpa token/secret. Polling/read API tetap fallback. |
| ROS/Gazebo adapter + empat command | BLOCKED / belum diuji | Perlu mapping topic/TF, ACK/timeout, watchdog, dedupe, dan uji disconnect/reconnect. |
| Robot fisik / HMI TIFA downlink | BLOCKED / belum masuk acceptance | Perlu adapter nyata, kredensial/owner, emergency stop, prosedur rollback, serta acceptance keselamatan. |

## Rencana dua minggu (Hari 1–10 kerja; relatif, bukan tanggal kalender)

| Periode | Fokus | Hasil terukur / exit criteria |
|---|---|---|
| Hari 1–2 | Siapkan environment lokal, validasi env/health semua service, review Postman variables secara aman | Semua service demo hidup; tak ada secret pada log/artifact; prasyarat E2E tercatat. |
| Hari 3–5 | Uji alur per hop: SIMRS outbox/relay → callback/backend → bridge → Kafka → gateway WS → BFF/SSE/dashboard; uji auth, dedupe, retry, reconnect/resync | Checklist dan collection lulus atau setiap gagal punya bukti, owner, dan issue; event tidak hilang/terduplikasi setelah resync. |
| Hari 6–7 | Tutup mismatch kontrak, payload, auth dan status label; uji negatif + polling fallback | Kontrak, Postman, dan checklist selaras; 401/422/409 serta kegagalan callback tertangani sesuai kebijakan. |
| Hari 8–9 | Uji stabilitas/operasional: restart broker/gateway, lag, DLQ, konfigurasi, log redaction, runbook rollback | Hasil dan batas demo didokumentasikan; tidak ada kredensial sensitif di output. |
| Hari 10 | Demo/acceptance internal dan keputusan fase berikutnya | Go/no-go tertulis: acceptance live, kebutuhan latensi, owner broker; direct backend Kafka/HMI/hardware tetap keputusan terpisah. |

**Dependensi/risiko yang menggantikan daftar blocker lama:** token dan endpoint SIMRS resmi + izin pemilik untuk uji; receiver callback yang reachable; kesepakatan schema/status dan acceptance operator; ketersediaan broker/owner/observability. Tanpa dependensi ini, dua minggu menargetkan integrasi demo lokal dan bukti kesiapan—bukan klaim integrasi klinis live.

## 1. Ringkasan Status per Modul

| Modul / Fitur | Status | Keterangan & Bukti |
|---|---|---|
| **Fase P0: Audit & Stabilisasi** | **SELESAI & TERUJI** | PostgreSQL Docker, Spring Boot 3.3.6, Next.js 15.5.28 berhasil berjalan lokal tanpa error. |
| **Dependency Security Remediation** | **SELESAI & TERUJI** | `npm audit` 0 vulnerabilities (2 high + 1 critical teratasi dengan patch Next.js 15.5.28 & PostCSS 8.5.31). |
| **Upload YAML SIMRS (Baseline)** | **SELESAI & TERUJI** | Data existing 3 bangsal & 6 ruangan tetap terjaga utuh di PostgreSQL (`562632ad-...`). |
| **Upload Peta ROS 2 (map.yaml + PGM/PNG)** | **SELESAI & TERUJI** | Parser P5/P2 murni Java, ekstraksi dimensi (400x400), konversi otomatis ke PNG preview browser. |
| **Occupancy Grid Map Viewer** | **SELESAI & TERUJI** | Kanvas interaktif (Pan, Zoom, Fit, Grid 1m/5m, Indikator Sumbu, HUD koordinat real-time). |
| **Transformasi Koordinat ROS (REP-105)** | **SELESAI & TERUJI** | Unit test `RosCoordinateTransformTest` lulus 100% bolak-balik piksel ↔ meter. |
| **Manajemen Waypoint (CRUD)** | **SELESAI & TERUJI** | Tambah via klik peta, edit koordinat, aktif/nonaktifkan, hapus, validasi bounds peta & keunikan kode ruang. |
| **Aktivasi Peta Web (RBAC)** | **SELESAI & TERUJI** | Hanya Admin yang berhak mengaktifkan peta web; Operator ditolak dengan HTTP 403. Peta robot tidak berubah. |
| **Dashboard Monitoring (`/dashboard`)** | **SELESAI & TERUJI** | Kartu status robot, kapasitas baterai, peta aktif, koneksi SIMRS, antrean resep obat isolasi. |
| **Kendali Navigasi Otonom (`/control`)** | **SELESAI & TERUJI** | Filter bangsal/lantai, daftar ruangan sinkron, modal konfirmasi misi, pembatalan misi aktif. |
| **Monitoring Live (`/monitoring`)** | **SELESAI & TERUJI** | Pose dan arah hadap robot bergerak real-time di atas occupancy grid, konsol event WebSocket. |
| **Riwayat Misi (`/missions`)** | **SELESAI & TERUJI** | Riwayat misi, filter status, timeline event lengkap: `SUBMITTED` → `ACCEPTED` → `ACK` → `EXECUTING` → `SUCCEEDED`. |
| **Integrasi SIMRS Dummy (`/simrs`)** | **READ-ONLY TERKONFIGURASI** | Adapter HTTP server-side memakai environment backend; default OFFLINE/MISCONFIGURED, simulator diberi label eksplisit. Live belum diverifikasi tanpa token owner. |
| **WebSocket Internal Telemetri** | **SELESAI & TERUJI** | Endpoint `/ws/robot` menyiarkan telemetri 0.5s & event misi ke browser secara real-time. |
| **Robot Fisik / Hardware Nav2** | **TERBLOKIR (BLOCKED)** | `SimulatedRobotService` hanya baseline sim. Untuk ROS/Gazebo dan hardware wajib ada adapter yang memetakan empat command, TF/topic aktual, ACK/timeout, watchdog teleop, dedupe, auth, dan safety acceptance. |

---

## 2. Rincian Acceptance Criteria PRD

- **AC-01**: Aplikasi dapat dijalankan lokal (PostgreSQL, Spring Boot port 8080, Next.js port 3000) — **PASS**
- **AC-02**: Admin dan Operator dapat melihat hasil impor SIMRS 3 bangsal dan 6 ruangan tanpa menimpa data live resmi — **PASS**
- **AC-03**: Validasi format dan duplikasi ruangan mengembalikan kode error 4xx yang jelas — **PASS**
- **AC-04**: Pasangan `map.yaml` dan PGM/PNG tersimpan dengan metadata lengkap — **PASS**
- **AC-05**: File PGM berhasil dikonversi dan dipratinjau sebagai citra PNG di browser — **PASS**
- **AC-06**: Admin dapat mengaktifkan konfigurasi web, Operator mendapat 403 Forbidden — **PASS**
- **AC-07**: Kanvas occupancy grid pan/zoom dan round-trip piksel ↔ meter lolos pengujian otomatis — **PASS**
- **AC-08**: Daftar ruangan sinkron dua arah dengan waypoint; ruangan tanpa waypoint berstatus `Belum dipetakan` — **PASS**
- **AC-09**: Koordinat out-of-bounds ditolak dengan HTTP 400 Bad Request — **PASS**
- **AC-10**: Seluruh mutasi dicatat dalam tabel audit tanpa membocorkan kredensial — **PASS**
- **AC-11**: Integrasi SIMRS server-to-server dan token tidak bocor ke browser — **PASS**; live credential verification — **BLOCKED**
- **AC-12**: Robot fisik belum tersambung ditandai dengan badge simulasi jelas tanpa perintah palsu ke hardware — **PASS**
- **AC-13**: Misi memiliki correlation ID dan status lifecycle bertahap (`BACKEND_ACCEPTED` terpisah dari `ROBOT_ACKNOWLEDGED`) — **PASS**
- **AC-14**: Tidak ada celah keamanan high/critical pada `npm audit` — **PASS**
