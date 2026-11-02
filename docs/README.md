# docs/ — indeks

**Sumber kebenaran hanya `api-contracts/`.** Dokumen lain di bawah ini runbook, catatan, atau riwayat:
jangan jadikan dasar perubahan kontrak; jika bertentangan dengan kode/kontrak, ikuti kode + kontrak
lalu perbarui catatan ini.

## api-contracts/ — SUMBER KEBENARAN
| Dokumen | Isi |
|---|---|
| `web-monitoring-integration.md` | Kontrak REST SIMRS↔monitoring + catatan perubahan (termasuk §1.3 status "tiba" tetap aktif) |
| `robot-command.md` | Envelope + 4 command downlink (`CMD_CANCEL_MISSION`, `CMD_RETURN_TO_DOCK`, `CMD_SET_SPEED` 0..2, `CMD_TELEOP_DRIVE` ±1/±2), REST fasad, registrasi robot |
| `robot-ws-tifa.md` | WS robot fisik ↔ `medical-ws` (SI/`ACK_SOFT`, uplink, downlink — gate fase) |
| `internal-publish-bridge.md` | Bridge `POST /internal/publish` + Kafka |
| `monitoring-events.md` | Event delivery |
| `hmi.md` | Kontrak HMI (tahap berikutnya) |

## Runbook & uji
- `testing-postman-simrs-web-monitoring.md` — test case Postman + **bukti live** (G1–G4). Koleksi `postman-f2.postman_collection.json`.
- `testing-full-integration.md` — uji lintas komponen F2.
- `../README.md` (root) — cara menjalankan semua service + arti halaman `/settings` dashboard.

## Redesain web monitoring (handoff rekan)
- `web-monitoring/FEATURE_MAP_4B.md` — **peta fitur `sstifa/` → dashboard, gap, aturan non-hardcode, konek robot real. Mulai dari sini untuk redesain.**
- `web-monitoring/ARCHITECTURE_DECISIONS.md`, `IMPLEMENTATION_STATUS.md`, `SIMRS_INTEGRATION_TEST_REPORT.md` — riwayat rekan/keputusan lama; bukan kontrak.
- `web-monitoring/SIMRS_CONTRACT_CHECKLIST.md` — checklist kontrak; ikon status implementasinya mengikuti periode penulisannya.

## Rencana & riwayat (bukan sumber kebenaran)
- `integration-roadmap-two-weeks.md` — roadmap 2 minggu; hari bersifat **relatif** (Hari 1–5, 6–10), bukan tanggal kalender.
- `findings-analisis-tifa.md` — findings sesi lama (port, workspace TIFA).
- `postman-f2.postman_collection.json` — koleksi Postman (variabel mengikuti port host compose).

## Folder lain
- `simrs-dummy/` — checklist & keputusan stack SIMRS (riwayat/operasional).
- `architecture/`, `ros2-integration/` — materi desain; `hmi/` — kosong, diisi saat tahap HMI (kontrak: `api-contracts/hmi.md`).
