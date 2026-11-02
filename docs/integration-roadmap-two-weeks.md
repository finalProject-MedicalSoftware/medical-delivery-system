# Integrasi Medical Delivery — Ringkasan dan Roadmap 2 Minggu

**Tanggal acuan:** 31 Oktober 2026 · **Horizon:** 10 hari kerja berikutnya (relatif)

## Yang sudah dibangun

- Backend Spring Boot menyediakan REST/misi dan robot simulasi berlabel sintetis; adapter SIMRS server-side menjaga kredensial di env backend.
- SIMRS Dummy memiliki outbox transaksional dan relay webhook dengan retry; SIMRS tidak mengakses Kafka.
- `medical-ws` menyediakan HTTP publish bridge, produce/consume Kafka pada `simrs.delivery.events.v1`, autentikasi WS, subscribe channel, dedupe, heartbeat, dan broadcast.
- Dashboard monitoring menyediakan BFF/SSE relay dan konfigurasi URL WS melalui env; polling/read API tetap jalur resync/fallback.
- Collection Postman F2 dan checklist E2E tersedia sebagai alat simulasi; credential/variable sensitif tidak boleh masuk slide atau artefak hasil.

## Arsitektur dan batas saat ini

```text
SIMRS Dummy [outbox + relay webhook]
       → receiver/callback yang dikonfigurasi
       → backend / proses bridge HTTP
       → medical-ws HTTP bridge → Kafka (simrs.delivery.events.v1)
       → medical-ws WebSocket → dashboard BFF/SSE → UI

Read API/snapshot ───────────────────────────────→ dashboard (resync/fallback)
```

Diagram ini menunjukkan target alur integrasi; validasi setiap hop harus didukung hasil uji terbaru. Baseline yang sudah jelas adalah backend memakai HTTP bridge ke `medical-ws`, gateway mengelola Kafka, dan dashboard mempunyai BFF/SSE. Direct Kafka dari backend, SIMRS live, HMI, serta robot fisik belum dinyatakan selesai.

## Roadmap dua minggu

| Periode | Fokus | Exit criteria |
|---|---|---|
| Hari 1–2 | Persiapan lokal, env aman, health semua service | Demo stack berjalan; variabel rahasia tidak tercetak/terekam. |
| Hari 3–5 | Postman E2E per hop dan lintas hop; auth, retry, dedupe, reconnect/resync | Hasil tersimpan dan checklist terisi; kegagalan dicatat dengan bukti/owner. |
| Hari 6–7 | Selaraskan schema, state transition, token header, errors, status UI | Kontrak, Postman, dan checklist konsisten; negative cases/fallback teruji. |
| Hari 8–9 | Restart/lag/DLQ, observability, redaksi log, rollback | Runbook demo dan hasil uji stabilitas; tidak ada klaim produksi yang tak terbukti. |
| Hari 10 | Review acceptance dan keputusan fase lanjutan | Go/no-go tertulis, owner/dependensi jelas. |

### Dependensi untuk integrasi live

Kredensial dan izin pemilik SIMRS; endpoint callback reachable; persetujuan schema/status dari pemilik; owner broker dan observability; acceptance operator. Jika belum tersedia, target dua minggu adalah integrasi demo lokal yang dapat direproduksi, bukan integrasi klinis live.

## Rujukan

- `AGENTS.md`
- `docs/api-contracts/web-monitoring-integration.md`
- `docs/web-monitoring/IMPLEMENTATION_STATUS.md`
- `docs/postman-f2.postman_collection.json`
- `docs/testing-full-integration.md`
