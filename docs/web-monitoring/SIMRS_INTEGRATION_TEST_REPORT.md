# Laporan Uji Integrasi SIMRS

| Skenario | Status | Catatan |
|---|---|---|
| `SIMRS_ENABLED=false` tidak outbound | PASS | Guard konfigurasi mencegah request dan mode OFFLINE |
| enabled tanpa URL/token | PASS | Mode MISCONFIGURED, tidak ada request |
| write disabled | PASS | Tidak ada POST, respons diberi `simulated=true` |
| handover dari monitoring | PASS | Ditolak sebelum request |
| mock server A/B melalui environment | BLOCKED | Belum ada mock server integration test di baseline |
| token sah dan SIMRS mapping live | BLOCKED | Token/izin owner belum tersedia |
| WebSocket/Kafka SIMRS | BLOCKED | DRAF sesuai kontrak |
| Runtime backend membaca `.env` | PASS | `SIMRS_ENABLED=true`, token configured, write disabled; token tidak dicetak |
| GET mapping server-to-server | PASS | HTTP 200, YAML valid, status `LIVE_READ_ONLY/CONNECTED` |
| Direktori `/api/v1/rooms` | PASS | Membaca `simrs_room_directory`, bukan `mapping_imports`; hasil aktual 6 ruangan live |
| Polling dan startup sync | PASS | `@PostConstruct` + fixed delay 30 detik; upsert idempotent dan tidak overlap |
| Manual refresh | PASS | `/integrations/simrs/status` memicu sync sebelum `/rooms` di halaman SIMRS/Mapping |
| Data live pembanding | PASS | Hasil runtime memuat `R-MELATI-101`, `R-MELATI-102`, `RJW-001`, `R-MAWAR-201`, `R-MAWAR-202`, `R-MELATI-109` |
| Redirect handling | PASS | HTTP client tidak auto-follow redirect; status non-2xx diklasifikasi tanpa meneruskan token ke host lain |
