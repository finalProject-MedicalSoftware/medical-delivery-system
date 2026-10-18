# Website Monitoring - Brand & Logo (DRAF)

Folder ini disiapkan untuk website monitoring (dashboard monitoring / HMI / robot).
Belum ada aplikasi di sini - hanya identitas visual dan kontrak arah data.

## Logo

- File: `logo.svg` (ubin solid, tanpa gradien, tanpa glow).
- Tile: `#0F172A` (slate-900). Layar + pulse: putih `#FFFFFF` dan teal `#14B8A6`.
- Titik status: amber `#F59E0B` (artinya: status armada/perangkat sekilas).
- Relasi dengan logo SIMRS Dummy (ubin teal + salib denyut putih):
  satu keluarga visual (motif denyut), peran dibedakan lewat bentuk
  (layar monitor vs salib medis) dan warna ubin.

## Arah data (ringkas, detail di `docs/api-contracts/monitoring-events.md`)

- SIMRS melempar: pasien + ruang/bed + pengantaran
  (`GET /api/v1/monitoring/snapshot`).
- Monitoring melempar balik: status pengantaran obat
  (`POST /api/v1/monitoring/delivery-status`).
- Auth: header `x-monitoring-token` (shared secret).
