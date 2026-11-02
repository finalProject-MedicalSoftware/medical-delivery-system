# Checklist Kontrak SIMRS

Sumber aktual kontrak: `../../api-contracts/` (`web-monitoring-integration.md`, `monitoring-events.md`) — lihat `../README.md`.

| Method/path | Kontrak utama | Implementasi | Uji |
|---|---|---|---|
| GET `/api/v1/monitoring/mapping` | YAML ward/room/bed, token, 401/503, polling 30 detik | Client backend + cache polling + proxy internal | Parsing YAML; konfigurasi off/missing |
| GET `/api/v1/monitoring/snapshot?since&limit` | limit maksimum 200, pasien/delivery incremental, rooms full | Client backend dan endpoint internal | Validasi limit; mock server perlu ditambahkan |
| GET `/api/v1/monitoring/active-deliveries?limit` | envelope generatedAt/count/deliveries, limit maks 200 | Client backend menormalkan envelope | Existing unit + kontrak envelope |
| GET `/api/v1/monitoring/patient/{mrn}` | pasien aktif + activeDeliveries, 404 | Client backend dan endpoint internal | Mock server perlu ditambahkan |
| POST `/api/v1/monitoring/delivery-status` | state machine, idempotency regex, 400/404/409/422/503; handover manusia | Validasi client, header/token, write gate | Unit invalid input; publik write off |
| WebSocket/Kafka | DRAF, trigger belum lengkap | Tidak diimplementasikan sebagai SIMRS | BLOCKED sesuai dokumen |

Catatan: `MOCK_HANDOVER_CONFIRMED` tidak termasuk status monitoring yang dapat dikirim. `compartmentNo` hanya valid pada `MOCK_ARRIVED_AT_ROOM`. Status dicocokkan dengan kode, bukan label.
