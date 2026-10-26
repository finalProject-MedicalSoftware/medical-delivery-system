/**
 * Rate limiter in-memory sederhana (fixed window).
 * ponytail: single-instance dev/demo; untuk multi-instance pindahkan ke
 * Redis/DB dan ganti implementasi `checkRateLimit` saja.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      // Prune bucket kedaluwarsa agar map tidak tumbuh tanpa batas.
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  if (existing.count < limit) {
    existing.count++;
    return { ok: true, retryAfterSec: 0 };
  }

  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Untuk test. */
export function resetRateLimits(): void {
  buckets.clear();
}
