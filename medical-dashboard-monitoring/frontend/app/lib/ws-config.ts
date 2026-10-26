/**
 * Satu sumber URL WebSocket gateway — tidak ada hardcode di komponen.
 * Set di frontend/.env:
 *   NEXT_PUBLIC_WS_URL=ws://localhost:8081/ws/robot   (WS backend rekan)
 *   NEXT_PUBLIC_WS_URL=ws://localhost:8081/ws/v1/deliveries  (WS medical-ws, Kafka→deliveries)
 *
 * catatan: NEXT_PUBLIC_* di-inline saat build Next.js; ganti URL = rebuild.
 */

export const WS_PORT_LABEL = process.env.NEXT_PUBLIC_WS_PORT || '8080';

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  `ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:${WS_PORT_LABEL}/ws/robot`;
