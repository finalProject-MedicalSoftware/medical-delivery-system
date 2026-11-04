# GAP-ANALYSIS-PROMPT — Audit Gap Nevo (Read-Only)

> Cara pakai: tempel prompt di bawah ke sesi agent baru di repo `medical-delivery-system/`. Prompt ini **read-only**: hasilnya laporan gap, bukan perubahan kode. Setelah laporan keluar, susun urutan kerja dari tabel gap sebelum menyentuh kode (aturan kontrak-dulu AGENTS.md).

```text
Kamu audit engineer proyek medical-delivery-system (Nevo). Target: menutup gap agar
robot terhubung end-to-end DAN dashboard monitoring berubah total fiturnya
(re-engineering architecture dari TIFA, versi medical — baca docs/nevo-dashboard/TIFA-TRANSPLANT.md).
Mode READ-ONLY: jangan ubah kode, kontrak, atau schema; output hanya laporan.

Baca dulu:
- AGENTS.md (aturan domain & status komponen)
- docs/api-contracts/*.md (kontrak = sumber kebenaran)
- docs/web-monitoring/FEATURE_MAP_4B.md dan IMPLEMENTATION_STATUS.md (sisa redesain)
- docs/testing-postman-simrs-web-monitoring.md (pola bukti G1–G4)
- Kode: medical-backend (robot adapter sim/real, SimrsClientService),
  medical-ws (bridge Kafka→WS, downlink ROBOT_COMMAND, uplink ROBOT_COMMAND_RESULT, e2e.mjs),
  medical-dashboard-monitoring/frontend (BFF/SSE, /settings, /robots),
  simrs-dummy (outbox+relay)
- docs/nevo-dashboard/ENHANCEMENT-NOTES.md (pola TIFA yang jadi acuan penyempurnaan)

Analisis gap per pilar:

A. Robot end-to-end
   - Downlink ROBOT_COMMAND (backend→gateway→robot): jalur validasi param, adapter sim/real
     (ROBOT_MODE), apakah semua langkah berkontrak dan tertutup uji.
   - Uplink ROBOT_COMMAND_RESULT: gateway→Kafka→WS sudah jalan, tapi backend BELUM konsumsi
     Kafka sehingga t_robot_command.result masih null → sarankan solusi minimal + dampaknya
     terhadap aturan 8 (Kafka hanya di medical-ws; keputusan bersama).
   - Identitas node: format kode node belum ditetapkan (prasyat owner) → usulkan pola pasangan
     RB/UI + grouping generik (acuan robotGrouping TIFA).
   - Autentikasi SI/token gateway: transplan pola JWT tifa (TOKEN-FLOW.md) ke kontrak Nevo;
     start mapping SLAM belum ada di kontrak & kode → tandai sebagai gap kontrak.

B. Ubah fitur total dashboard monitoring
   - Sisa item redesain 4B (FEATURE_MAP_4B.md) yang belum selesai.
   - Skema tabel h_* (battery, command_log, connection_log, state, ws_traffic) belum ada.
   - Notifikasi per device + robot-ready toast; SSE relay via BFF (bukan WS langsung dari browser).
   - Teleop tombol+WASD: uji HANYA sim mode; perintah fisik butuh izin owner.
   - Bersihkan sisa mock/hardcode (aturan 1 & 4: label [MOCK]/SIMULATED via kode; env only).

C. Kontrak & uji
   - Mismatch kontrak/data/auth yang tersisa; retry/dedupe; ruang lingkup e2e per fitur baru
   (pola bukti G1–G4).

Output yang diminta:
1. Tabel gap: id | pilar | komponen | deskripsi | dampak | effort (S/M/L) | urutan.
2. Daftar prasyat keputusan owner (yang tidak boleh diputuskan agent).
3. Usulan urutan kerja: web+SIMRS dulu → konsumsi result → registri node →
   monitoring h_* → HMI & fisik terakhir dengan izin owner.
4. Daftar kontrak/checklist yang harus diperbarui kalau gap dikerjakan.
```

## Setelah laporan gap keluar

1. Bedah laporan bersama user; tandai gap mana butuh keputusan owner (identitas node, konsumsi Kafka, SLAM).
2. Susun backlog berurutan; setiap gap yang menyentuh kontrak → perbarui `docs/api-contracts/` dulu, catat keputusan, lalu selaraskan Postman/checklist.
3. Uji tiap gap sesuai `UJI-INTEGRATION.md`.
