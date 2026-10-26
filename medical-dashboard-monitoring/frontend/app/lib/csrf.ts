/**
 * Token CSRF disimpan backend di cookie `XSRF-TOKEN` (HttpOnly=false) dan wajib
 * dikirim balik sebagai header `X-XSRF-TOKEN` untuk semua request non-GET.
 */
export function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? { 'X-XSRF-TOKEN': decodeURIComponent(match[1]) } : {};
}
