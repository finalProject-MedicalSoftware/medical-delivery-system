# Keputusan Arsitektur NEVO

## 20 Oktober 2026 — SIMRS melalui environment backend

- URL, token, toggle, dan timeout SIMRS hanya berasal dari environment Spring Boot melalui `SimrsProperties`.
- Default integrasi adalah nonaktif (`SIMRS_ENABLED=false`, `SIMRS_WRITE_ENABLED=false`). URL contoh hanya ada di `backend/.env.example` dan panduan operator.
- Browser tidak pernah menerima token atau melakukan request langsung ke SIMRS. Backend memakai header `x-monitoring-token`.
- HTTP polling/read API pada `monitoring-events.md` adalah kontrak final fase mock. WebSocket/Kafka pada `web-monitoring-integration.md` tetap draf dan tidak diimplementasikan sebagai integrasi SIMRS.
- Upload YAML manual tetap merupakan preview/import terpisah; tidak menggantikan mapping live.
- POST status ke SIMRS publik hanya mungkin bila `SIMRS_WRITE_ENABLED=true` dikonfigurasi eksplisit; default dan pengujian lokal tidak mengirim POST publik.
