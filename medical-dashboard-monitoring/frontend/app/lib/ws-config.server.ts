/**
 * Server-only secrets — jangan pernah diimport dari komponen klien.
 * Dipakai hanya oleh Route Handlers (api/ws/stream, api/ws/session).
 */
export const WS_BACKEND_URL = process.env.WS_BACKEND_URL || 'ws://127.0.0.1:8081/ws/v1/deliveries';
export const WS_AUTH_TOKEN = process.env.WS_AUTH_TOKEN || '';

export function wsBackendPath(): string {
  try { return new URL(WS_BACKEND_URL).pathname; } catch { return '/ws/v1/deliveries'; }
}
