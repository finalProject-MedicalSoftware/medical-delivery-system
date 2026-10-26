// Label manusiawi untuk `mode` dari GET /api/v1/simrs/status (lihat SimrsClientService.getConnectionStatus).
export type SimrsTone = 'live' | 'warn' | 'error' | 'idle';

const MODES: Record<string, { label: string; tone: SimrsTone }> = {
  LIVE_READ_ONLY: { label: 'Terhubung Live (read-only)', tone: 'live' },
  CONNECTED: { label: 'Terhubung Live (read-only)', tone: 'live' },
  NOT_SYNCED: { label: 'Belum pernah sinkron', tone: 'idle' },
  DISABLED: { label: 'Integrasi dimatikan', tone: 'idle' },
  STALE: { label: 'Data cache kedaluwarsa', tone: 'warn' },
  MISCONFIGURED: { label: 'Konfigurasi belum lengkap', tone: 'warn' },
  AUTH_ERROR: { label: 'Token SIMRS ditolak', tone: 'error' },
  DISCONNECTED: { label: 'SIMRS tidak terjangkau', tone: 'error' },
  OFFLINE: { label: 'SIMRS offline', tone: 'error' },
};

export const SIMRS_TONE_DOT: Record<SimrsTone, string> = {
  live: 'bg-success animate-pulse',
  warn: 'bg-warning',
  error: 'bg-error',
  idle: 'bg-offline',
};

export function simrsMode(mode?: string | null): { label: string; tone: SimrsTone } {
  if (!mode) return { label: 'Memuat status', tone: 'idle' };
  return MODES[mode] ?? { label: mode, tone: 'idle' };
}
