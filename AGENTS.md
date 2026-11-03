# Medical Delivery System — AGENTS

## Struktur (fase restrukturisasi KP TIFA-style)

```
medical-delivery-system/            # repo utama (dokumentasi, kontrak & orkestrasi)
├── medical-backend/                # Spring Boot (pindahan backend rekan) — repo git sendiri
├── medical-ws/                     # WebSocket gateway: Kafka → WS — repo git sendiri
├── medical-dashboard-monitoring/   # murni web (Next.js + BFF proxy) — repo git rekan (analog tifa-web)
├── medical-hmi/                    # HMI robot (milik sendiri)
├── simrs-dummy/                    # SIMRS Dummy Next.js (outbox+relay kelak)
├── robot/
└── docs/api-contracts/             # sumber kebenaran semua kontrak
```

## Status

| Komponen | Status |
|---|---|
| `medical-backend/` | Spring Boot: REST + adapter robot `sim`/`real` (`ROBOT_MODE`; `real` = `RealRobotAdapter` downlink via gateway, validasi param di backend) + SimrsClientService (read-only polling, cache V5) |
| `medical-ws` | Gateway WS aktif: bridge HTTP → Kafka (`simrs.delivery.events.v1`) + konsumsi → broadcast WS; downlink `ROBOT_COMMAND` (UI→robot) + uplink `ROBOT_COMMAND_RESULT` → Kafka; `GET /internal/robots`; run: `npm install && npm run check && npm run dev` |
| `medical-dashboard-monitoring/frontend` | Redesain 4B: koneksi runtime dari `/settings` (server-side BFF `data/settings.json`, env = default; tanpa hardcode/localStorage), relay SSE BFF, teleop tombol + **WASD** di `/robots` |
| `simrs-dummy/medical-simrs-web` | Hidup; outbox+relay webhook (SIMRS TIDAK menyentuh Kafka — Kafka hidup di `medical-ws`) |
| `medical-hmi/` | Belum dimulai; konsumsi Kafka nanti |

## Arah kerja dan aturan agent

- Baca dokumen kontrak/status yang relevan sebelum mengubah komponen. Jika instruksi atau status berbeda, verifikasi implementasi terkini lalu perbarui dokumentasi; jangan menganggap catatan lama lebih benar.
- Status saat ini: gateway `medical-ws` menerima event melalui bridge HTTP backend → Kafka dan menyiarkannya ke WS; dashboard menggunakan BFF/SSE. SIMRS Dummy memiliki outbox+relay webhook. Downlink robot (`ROBOT_COMMAND` UI→robot) **sudah jalan** sejak 3/11/2026: gate "real" `robot-ws-tifa.md` §6 dibuka atas kesepakatan owner; backend `ROBOT_MODE=real` → `RealRobotAdapter` → `/internal/publish` → gateway → frame ke robot, hasil uplink `ROBOT_COMMAND_RESULT` → Kafka+WS (backend belum mengonsumsi Kafka sehingga `t_robot_command.result` masih null — catatan kontrak). Dashboard: koneksi runtime `/settings` (server-side BFF), teleop tombol+WASD. Ini tetap jalur demo dengan robot nyata yang terhubung WS, bukan integrasi klinis; servo/fisik di luar kontrak. E2E SIMRS → backend → Kafka → WS/BFF tererekam (`medical-ws/e2e.mjs`, bukti G1–G4 di `docs/testing-postman-simrs-web-monitoring.md`). Gap verifikasi tersisa: start mapping SLAM belum ada di kontrak & kode; downlink fisik butuh uji dengan robot sungguhan (prosedur di README "Uji robot fisik").
- Prioritas berikutnya: (1) uji downlink dengan robot fisik sungguhan (prosedur README "Uji robot fisik"), (2) lanjut redesain web monitoring mengikuti `docs/web-monitoring/FEATURE_MAP_4B.md` yang belum selesai (tanpa hardcode, kontrak dulu untuk fitur baru), (3) tutup sisa mismatch kontrak/data/auth dan retry/dedupe, (4) konsumsi Kafka di backend agar `t_robot_command.result` terisi (butuh keputusan bersama karena aturan 8), (5) HMI setelah kontrak dan owner tersedia (`docs/api-contracts/hmi.md`).
- Dalam rencana dua minggu, tandai minggu sebagai relatif (Hari 1–5 dan 6–10); jangan mengarang tanggal kalender atau menyebut pekerjaan rencana sebagai selesai.
- Jangan hapus blocker/risiko substantif. Jika berkas blocker lama dihapus, pindahkan isi yang masih berlaku menjadi dependensi/risiko dan tindakan berikutnya pada dokumen status.
- Sebelum mengubah kontrak/API/topologi: jelaskan perubahan dan dampaknya, catat keputusan/status, lalu selaraskan collection Postman dan checklist uji yang terdampak. Jangan ubah diam-diam.

## Aturan yang bertahan

1. Data sintetis; label `[MOCK]`/`SIMULATED` via kode, bukan catatan manual.
2. `compartmentNo` = integer, hanya di payload arrival/handover; tidak pernah di read API.
3. QR hanya `{base}/scan/{mrn}?t=<token>` (token = exp + HMAC-SHA256 atas `{mrn}:{exp}`), diverifikasi sebelum data pasien dibaca; serah-terima hanya manusia (tidak ada transisi otomatis ARRIVED→HANDOVER mesin).
4. Tidak ada hardcode port/URL/token — semua via env; secret hanya di `.env`, tidak pernah dicommit.
5. Token via header, bukan query param / URL.
6. Kontrak menjadi sumber kebenaran; perubahan kontrak = diskusi dan tercatat, bukan diam-diam.
7. Token di log: hanya prefix 4 karakter.
8. Kafka hanya di `medical-ws` (produce dari bridge HTTP + consume ke WS). Backend direct Kafka adalah enhancement yang belum dikerjakan dan butuh keputusan; SIMRS Dummy tetap outbox+relay webhook dan tidak pernah menyentuh broker.
