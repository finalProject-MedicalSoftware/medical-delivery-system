/**
 * Server-only resolvers — jangan pernah diimport dari komponen klien.
 * Dipakai oleh Route Handlers (api/ws/stream, api/ws/command, api/ws/session, api/proxy).
 *
 * Urutan resolusi: sesi runtime (diset via POST /api/ws/session `setConnection`)
 * → fallback env (redesain 4B: tanpa hardcode, koneksi bisa diganti saat runtime).
 */
import { getSession } from './ws-session';

const ENV_SIMRS_URL = process.env.SIMRS_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8080';
// Default mengikuti deployment Docker: medical-ws container 8081 → host 8083. Override via env WS_BACKEND_URL.
const ENV_WS_BACKEND_URL = process.env.WS_BACKEND_URL || 'ws://127.0.0.1:8083/ws/v1/deliveries';

/** URL SIMRS backend REST yang dipakai proxy BFF + auth/me. */
export function simrsUrl(): string {
  return getSession().endpoints?.simrsUrl?.trim() || ENV_SIMRS_URL;
}

/** URL WS gateway (target relay BFF → medical-ws). */
export function wsBackendUrl(): string {
  return getSession().endpoints?.wsUrl?.trim() || ENV_WS_BACKEND_URL;
}

/** Bearer token ke gateway: override sesi → env. Dipakai sebagai token SI-UI. */
export function wsAuthToken(): string {
  return (getSession().wsToken || '').trim() || process.env.WS_AUTH_TOKEN || '';
}

export function wsBackendPath(): string {
  try { return new URL(wsBackendUrl()).pathname; } catch { return '/ws/v1/deliveries'; }
}
