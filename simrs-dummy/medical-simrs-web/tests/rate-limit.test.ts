import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mengizinkan sampai limit", () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit("k1", 5, 60_000);
      expect(r.ok).toBe(true);
    }
  });

  it("menolak setelah melewati limit dengan retryAfterSec > 0", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k2", 5, 60_000);
    const r6 = checkRateLimit("k2", 5, 60_000);
    expect(r6.ok).toBe(false);
    expect(r6.retryAfterSec).toBeGreaterThan(0);
    expect(r6.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("reset setelah window berlalu", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k3", 5, 60_000);
    expect(checkRateLimit("k3", 5, 60_000).ok).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit("k3", 5, 60_000).ok).toBe(true);
  });

  it("key berbeda punya bucket independen", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k4", 5, 60_000);
    expect(checkRateLimit("k4", 5, 60_000).ok).toBe(false);
    expect(checkRateLimit("k5", 5, 60_000).ok).toBe(true);
  });
});
