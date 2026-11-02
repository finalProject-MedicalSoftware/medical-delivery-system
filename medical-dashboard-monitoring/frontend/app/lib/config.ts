/**
 * Frontend config hash reader — receives a JSON snapshot from
 * GET /api/v1/simrs/admin/config (ADMIN-only). Caller must check role before usage.
 *
 * ponytail: saat ini hanya simrs config; tambahkan key lain jika ada panel admin baru.
 */
export interface SimrsAdminConfig {
  enabled: boolean;
  baseUrl: string;       // masked (no token)
  writeEnabled: boolean;
  pollIntervalSeconds: number;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  writeMaxAttempts: number;
  configured: boolean;
}

let _cache: SimrsAdminConfig | null = null;

export function getSimrsAdminConfig(): SimrsAdminConfig | null {
  return _cache;
}

export function setSimrsAdminConfig(cfg: SimrsAdminConfig): void {
  _cache = cfg;
}
