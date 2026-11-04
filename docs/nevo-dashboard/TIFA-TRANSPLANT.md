# Nevo Medical — Re-Engineering Architecture (REA) dari TIFA

> Dibuat 4/11/2026. Prinsip REA: Nevo dibangun dengan arsitektur yang **kurang lebih sama seperti TIFA, tetapi versi Nevo medical** — pola infrastruktur & UI ditransplant lalu di-*re-engineer*, dengan beberapa penyesuaian. Pola infrastruktur dipindah; aturan domain medis Nevo tetap milik Nevo sendiri (tidak disalin mentah dari TIFA).

## Sumber bacaan utama

| Sumber | Isi |
|---|---|
| `AGENTS.md` (root) | Aturan proyek, status komponen, arah kerja |
| `docs/api-contracts/*.md` (6 file) | Kontrak API — sumber kebenaran; perubahan = diskusi + catat, bukan diam-diam |
| `docs/web-monitoring/FEATURE_MAP_4B.md` | Peta redesain dashboard (redesain 4B, belum selesai) |
| `docs/web-monitoring/ARCHITECTURE_DECISIONS.md` | Keputusan arsitektur web monitoring |
| `docs/testing-postman-simrs-web-monitoring.md` | Bukti uji E2E (pola G1–G4) |
| TIFA: `tifa-web/lib/wsClient.ts`, `lib/settings.ts`, `lib/utils/robotGrouping.ts` | Referensi pola yang ditransplant |

## Komponen Nevo (per AGENTS.md)

| Komponen | Isi | Status |
|---|---|---|
| `medical-backend/` | Spring Boot: REST + robot adapter `sim`/`real` (`ROBOT_MODE`; `real` = `RealRobotAdapter` downlink via gateway, validasi param di backend); SimrsClientService read-only polling cache V5 | Jalan |
| `medical-ws/` | Gateway: bridge HTTP → Kafka (`simrs.delivery.events.v1`) → broadcast WS; downlink `ROBOT_COMMAND` (UI→robot) + uplink `ROBOT_COMMAND_RESULT` → Kafka+WS; `GET /internal/robots` | Jalan; e2e `e2e.mjs` ada |
| `medical-dashboard-monitoring/frontend` | Next.js + BFF proxy; koneksi runtime dari `/settings` (server-side `data/settings.json`, env default; tanpa hardcode/localStorage); relay SSE BFF; teleop tombol + WASD di `/robots` | Redesain 4B berjalan, belum selesai |
| `simrs-dummy/medical-simrs-web` | Outbox + relay webhook (SIMRS tidak pernah menyentuh Kafka — Kafka hanya di `medical-ws`) | Hidup |
| `medical-hmi/` | Konsumsi Kafka nanti | Belum dimulai |

## Peta transplan TIFA → Nevo (7 area)

| # | Pola TIFA (file referensi) | Transfer ke Nevo | Status Nevo |
|---|---|---|---|
| 1 | Koneksi runtime `/settings` (`lib/settings.ts`: baca settings.json per-call, env default, tanpa hardcode/localStorage) | Sudah dianut redesain 4B; jaga pola untuk setiap fitur baru (kontrak dulu) | ✅ sebagian besar ada |
| 2 | Sesi WS + token: turn-on/turn-off (lock email), `fetchJwtToken()` env→JWT 24 h→SI + `validateToken`, `handshakeTimeout: 8000`, pelajaran duplicate (self-kill 4002; `force:true` kick zombie) | medical-ws sudah punya downlink/uplink & internal robots; transplan TOKEN-FLOW.md + keputusan aturan 8 untuk konsumsi Kafka di backend (`t_robot_command.result` masih null) | ⚠️ jalan, result uplink belum dikonsumsi backend |
| 3 | Multi-robot: pasangan kode device (TFRBxx+TFUIxx), robotGrouping regex → `TIFA-xxx`, seed idempotent `m_device` | Format kode node Nevo = prasyat keputusan owner → lalu transplan grouping + seed pattern | ❌ format node belum ditetapkan |
| 4 | Teleop: tombol+WASD per grup, teleop-done, map select, TALK_ON/OFF, origin_id, antrean perintah DB saat WS mati | Sudah ada tombol+WASD di `/robots`; lanjut redesain 4B; fitur baru tetap kontrak dulu | ⚠️ dasar ada, perluasan sesuai FEATURE_MAP_4B |
| 5 | Monitoring/riwayat: tabel `h_*` (battery, command_log, connection_log, state, ws_traffic), notifikasi per device, robot-ready toast, SSE relay via BFF | Susun skema `h_*` setara di DB Nevo + halaman monitoring/notifikasi via backend & BFF/SSE | ❌ belum |
| 6 | Uji & bukti: `e2e.mjs`, Postman, docs bukti G1–G4 | medical-ws sudah punya e2e; transplan pola dokumentasi bukti untuk setiap fitur baru | ⚠️ pola e2e ada, docs bukti belum |
| 7 | Aturan domain TIFA — **TIDAK ditransplant apa adanya** | Tetap jadi aturan medis Nevo sendiri (lihat bawah); REA hanya memindahkan pola infrastruktur/UI | — |

## Penyesuaian REA — aturan domain Nevo (jangan disalin dari TIFA)

1. Data sintetis; label `[MOCK]`/`SIMULATED` dibuat lewat kode, bukan catatan manual.
2. `compartmentNo` = integer, hanya di payload arrival/handover; tidak pernah muncul di read API.
3. QR hanya `{base}/scan/{mrn}?t=<token>` (token = exp + HMAC-SHA256 atas `{mrn}:{exp}`), diverifikasi sebelum data pasien dibaca; serah-terima hanya manusia (tidak ada transisi otomatis ARRIVED→HANDOVER oleh mesin).
4. Token di log: hanya prefix 4 karakter.
5. Tanpa hardcode port/URL/token — semua via env; secret hanya di `.env`; token lewat header, bukan query param.
6. Kafka hanya di `medical-ws`; SIMRS Dummy outbox+relay webhook dan tidak pernah menyentuh broker.
7. Kontrak = sumber kebenaran; ubah kontrak = jelaskan dampak + catat + selaraskan Postman/checklist.

## Prasyat keputusan owner (sebelum eksekusi)

- Nama/format kode node & gateway Nevo (penamaan unit pasangan RB/UI).
- Gateway Nevo memakai Kafka seperti tifa-ws? (aturan: Kafka hanya di gateway — sudah berlaku di medical-ws).
- Penempatan BE + DB Nevo di server vs lokal dulu.
- Konsumsi Kafka `ROBOT_COMMAND_RESULT` di backend (keputusan bersama — aturan 8).
- Kriteria selesai integrasi web+SIMRS sebelum lanjut ke gateway.

## Urutan eksekusi Nevo (selaras prioritas AGENTS.md)

1. **Integrasi web + SIMRS dulu** — sisa redesain 4B + tutup mismatch kontrak/data/auth + retry/dedupe.
2. **Konsumsi `ROBOT_COMMAND_RESULT` di backend** agar `t_robot_command.result` terisi (keputusan bersama, aturan 8).
3. **Registri node & grouping multi-robot** (setelah format kode diputuskan owner).
4. **Monitoring `h_*` + notifikasi.**
5. **HMI & robot fisik paling akhir** — downlink fisik selalu butuh izin owner.

## File pendamping di folder ini

- `GAP-ANALYSIS-PROMPT.md` — prompt audit gap (read-only) sebelum eksekusi.
- `ENHANCEMENT-NOTES.md` — catatan penguatan web monitoring Nevo (9 prioritas).
- `TOKEN-FLOW.md` — alur autentikasi versi Nevo.
- `DEPLOY-RUNBOOK.md` — runbook deploy server.
- `UJI-INTEGRATION.md` — checklist uji end-to-end.
