# Status integrasi end-to-end (per 4/11/2026)

> Status tercatat berbasis bukti, bukan rencana. Sumber bukti:
> `docs/testing-postman-simrs-web-monitoring.md` §G1–G4,
> `medical-ws/e2e.mjs` (bridge→Kafka→WS + downlink + `/internal/robots`),
> kontrak `robot-ws-tifa.md` §5b–§6 (gate "real" dibuka keputusan owner 3/11/2026).

## 1. Rantai uplink (SIMRS → dashboard)

```
simrs-web (outbox DB)
  → simrs-relay (webhook HTTP)
    → medical-backend  POST webhook → DB monitoring (t_delivery, ...)
      → bridge HTTP  POST /internal/publish (X-Internal-Secret)
        → medical-ws  → Kafka topic `simrs.delivery.events.v1`
          → konsumsi gateway → broadcast WS (channel `all` / `robot:<id>`)
            → dashboard BFF (SSE relay) → browser
```

Status: **aktif & teruji**.

| Tahap | Bukti |
|---|---|
| outbox → relay → webhook backend → DB | G4.3 (`/monitoring/active-deliveries` 200, delivery `[MOCK]`) |
| bridge → Kafka → broadcast | G4.4 (`202 accepted`), G4.5 (duplikat → `400 DUPLICATE`, broadcast tepat 1×) |
| klien WS terima event | G4.6 (`SNAPSHOT_REQUIRED` → `SUBSCRIBED` → `DELIVERY_REQUESTED`) |
| dashboard SSE | G3 (stream `/api/ws/stream` hidup, `/robots` update live) |

## 2. Rantai downlink (dashboard/backend → robot)

```
dashboard teleop (tombol/WASD) / API
  → backend `t_robot_command` (202, validasi param di backend)
    → adapter: ROBOT_MODE=sim → SimRobotAdapter (SIMULATED)
              ROBOT_MODE=real → RealRobotAdapter
      → POST /internal/publish (X-Internal-Secret)
        → medical-ws → frame TIFA verbatim ke socket robot (SI)
          → robot fisik/klien ROS
            → uplink ROBOT_COMMAND_RESULT → Kafka `simrs.robot.events.v1` + broadcast WS
```

Status: **jalur 5a/5b aktif dan diuji di gateway** (`robot-ws-tifa.md` §5b:
`e2e.mjs` + `scripts/tifa-selfcheck.js`, 20 asersi). Gate "real" dibuka
keputusan tertulis owner 3/11/2026 (`ROBOT_MODE=real` → `RealRobotAdapter`).

## 3. Gap terbuka (berbasis bukti)

| # | Gap | Dampak | Status/tindakan |
|---|---|---|---|
| G-a | Backend belum mengonsumsi Kafka | `t_robot_command.result` masih `null` meski `ROBOT_COMMAND_RESULT` sudah masuk Kafka+WS | Butuh keputusan bersama (AGENTS.md aturan 8: Kafka hanya di `medical-ws`); backend direct-Kafka = enhancement tercatat |
| G-b | Robot fisik belum connect | Uji downlink fisik (prosedur README "Uji robot fisik") belum bisa jalan; roster gateway kosong | Menunggu koneksi robot `TFRB1` (di luar repo); syarat keselamatan §6: owner di ruangan, operator dekat robot, prosedur stop diketahui |
| G-c | Start mapping / SLAM belum ada di kontrak & kode | Fitur mapping belum bisa diklaim di arah mana pun | Kontrak dulu (aturan 6) sebelum implementasi |
| G-d | Domain publik `simrs.cdprojectdiagonal.web.id` = web SIMRS Next.js, bukan backend | Error `NOT_THE_BACKEND` bila URL itu diisi di `/settings` | Backend perlu origin/deploy terpisah; dashboard kini normalisasi trailing slash + suffix `/api/v1` (`normalizeBaseUrl`) |
| G-e | Downlink fisik belum teruji dengan robot sungguhan | Servo/fisik di luar kontrak; ini jalur demo, bukan integrasi klinis | Prioritas (1) AGENTS.md: uji dengan robot fisik |

## 4. Batas klaim

- Semua data sintetis berlabel `[MOCK]`/`SIMULATED` diproduksi sumber (aturan 1).
- HTTP 202 bukan bukti gerak robot fisik; uji fisik menunggu G-b.
- Perubahan rantai/kontrak berikutnya wajib tercatat di dokumen ini dan
  kontrak terkait, bukan diam-diam (aturan 6).
