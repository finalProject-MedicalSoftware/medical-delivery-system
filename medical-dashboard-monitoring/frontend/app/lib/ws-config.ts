/**
 * Browser-safe WS config — path relay SSE di BFF ini sendiri (relatif, tanpa host).
 * Token & URL backend gateway ada di ws-config.server.ts (server-only).
 *
 * catatan: NEXT_PUBLIC_* di-inline saat build Next.js; ganti URL = rebuild.
 */
export const WS_RELAY_PATH = process.env.NEXT_PUBLIC_WS_RELAY_URL || '/api/ws/stream';

export const WS_PORT_LABEL = process.env.NEXT_PUBLIC_WS_PORT || '8080';

/** Legacy alias (path saja, tanpa host) — dipakai halaman lama. */
export const WS_URL = WS_RELAY_PATH;
