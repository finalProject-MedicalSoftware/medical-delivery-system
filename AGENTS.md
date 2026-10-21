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
| `medical-backend/` | Spring Boot: REST kontrak mock final + SimulatedRobotService + SimrsClientService (read-only polling, cache V5) |
| `medical-ws/` | Scaffold baru (Node.js ws + kafkajs), mengikuti pola `tifa-ws`; run: `npm install && npm run check && npm run dev` |
| `medical-dashboard-monitoring/frontend` | WS URL kini dari `app/lib/ws-config.ts` (env `NEXT_PUBLIC_WS_URL`, tanpa hardcode) |
| `simrs-dummy/medical-simrs-web` | Hidup; outbox+relay untuk Kafka kelak |
| `medical-hmi/` | Belum dimulai; konsumsi Kafka nanti |

## Aturan yang bertahan

1. Data sintetis; label `[MOCK]`/`SIMULATED` via kode, bukan catatan manual.
2. `compartmentNo` = integer, hanya di payload arrival/handover; tidak pernah di read API.
3. QR hanya `{base}/scan/{mrn}`; serah-terima hanya manusia (tidak ada transisi otomatis ARRIVED→HANDOVER mesin).
4. Tidak ada hardcode port/URL/token — semua via env; secret hanya di `.env`, tidak pernah dicommit.
5. Token via header, bukan query param / URL.
6. Kontrak menjadi sumber kebenaran; perubahan kontrak = diskusi dan tercatat, bukan diam-diam.
7. Token di log: hanya prefix 4 karakter.
