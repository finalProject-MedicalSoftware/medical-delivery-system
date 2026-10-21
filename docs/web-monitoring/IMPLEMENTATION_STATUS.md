# Status Implementasi NEVO Web Monitoring

**Tanggal Evaluasi:** 20 Oktober 2026  
**Baseline Proyek:** `medical-dashboard-monitoring/`  
**Target:** PRD NEVO Web Monitoring & Scaffold v2 (SIMRS Dummy Public Integration)

---

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
| **Robot Fisik / Hardware Nav2** | **TERBLOKIR (BLOCKED)** | Menunggu kontrak integrasi aktual dari tim robot (ROSBridge, TF frame, topic Nav2). Dilayani oleh `SimulatedRobotService`. |

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
