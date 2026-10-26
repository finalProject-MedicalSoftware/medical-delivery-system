# medical-ws

WebSocket gateway untuk Medical Delivery — konsumen topik Kafka
`simrs.delivery.events.v1`, penyebar ke browser/HMI lewat WebSocket.
Mengikuti pola `tifa-ws`, acuan kontrak:
`docs/api-contracts/web-monitoring-integration.md` (Bagian 2 & 3).

```
SIMRS --(outbox/relay)--> Kafka --(simrs.delivery.events.v1)--> medical-ws --(WS)--> Browser / HMI / rekan-backend
```

## Endpoint & protokol

- `ws://<host>:8081/ws/v1/deliveries` (default, konfigurasi via `WS_PORT`, `WS_PATH`)
- Auth di handshake: header `Authorization: Bearer <token>`.
  Token dari `WS_AUTH_TOKEN`; **kosong = semua koneksi ditolak (close `4401`)**.
- Koneksi baru → server kirim `{ "type": "SNAPSHOT_REQUIRED", reason: "CONNECT" }`
  → klien wajib resync via read API `GET /api/v1/monitoring/active-deliveries` SEBELUM memercayai push.
- Subscribe:

  ```json
  { "action": "subscribe", "channels": ["all", "ward:A", "delivery:DELIV-20261018-0001"] }
  ```

  → `{ "type": "SUBSCRIBED", "channels": ["all", "ward:A", ...] }`
- Server ping tiap 15s; klien wajib pong ≤ 15s, else terminate (kontrak 2.4).
- Envelope event server→klien: SATU bentuk dengan Kafka (Bagian 2.3 kontrak).
- Tipe event: `DELIVERY_CREATED | DELIVERY_STATUS_CHANGED | DELIVERY_ARRIVED |
  HANDOVER_CONFIRMED | DELIVERY_CANCELLED | SNAPSHOT_REQUIRED`.
  `compartmentNo` hanya di payload arrival/handover.
- Health: `GET /healthz`.

## Kafka

- Konsumen group `medical-ws-group`, topik `simrs.delivery.events.v1`.
- Pesan tidak-valid → DLQ `simrs.delivery.events.dlq` (at-least-once).
- Dedupe `eventId` server-side TTL 15 menit (mengurangi fanout);
  konsumen akhir tetap wajib dedupe sendiri.
- Kafka tidak tersedia → WS tetap hidup, retry 10s; klien fallback polling (kontrak final tetap).

## Menjalankan

```bash
cp .env.example .env      # isi WS_AUTH_TOKEN min. 8 karakter dulu
npm install
npm run check             # self-check logic murni (channel/envelope/dedupe)
npm run dev
```

## Catatan batas fase

- Auth: fase mock hanya Bearer token mesin. Cookie sesi browser (same-origin)
  menyusul — lihat `src/ws/server.js` (ponytail).
- Topik `simrs.robot.events.v1` sengaja TIDAK disubscribe — fase NEVO nyata belum mulai.
