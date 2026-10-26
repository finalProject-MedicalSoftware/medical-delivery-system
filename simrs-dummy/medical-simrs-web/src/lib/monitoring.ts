import prisma from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Auth bersama untuk endpoint mock integrasi monitoring.
 * Fail-closed: kalau MONITORING_TOKEN belum di-set, semua request ditolak.
 * Token salah dilog ke audit_logs (hanya prefix token 4 karakter) dan
 * di-throttle per IP.
 */

const MONITOR_MAX_FAILURES = 5;   // kegagalan token per menit per IP
const MONITOR_READ_MAX = 120;     // panggilan sah per menit per IP
const MONITOR_WINDOW_MS = 60_000;

export const MONITORING_SERVICE_USERNAME = "monitoring_service";
export const MONITORING_TOKEN_HEADER = "x-monitoring-token";

function clientIpFrom(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Audit token salah — fire-and-forget; jangan pernah gagalkan response. */
async function recordInvalidTokenAttempt(ip: string, got: string | null): Promise<void> {
  try {
    // actorId adalah FK non-nullable ke user; butuh akun monitoring_service.
    // Bila belum di-seed, audit di-skip agar tidak memblokir response.
    const actorId = await getMonitoringActorId();
    if (!actorId) return;
    await prisma.auditLog.create({
      data: {
        entityType: "MONITORING",
        entityId: MONITORING_SERVICE_USERNAME,
        action: "MONITORING_TOKEN_INVALID",
        actorId,
        // Token hanya prefix 4 karakter (aturan log di repo).
        details: { ip, tokenPrefix: (got ?? "").slice(0, 4) },
      },
    });
  } catch {
    // Abaikan kegagalan audit.
  }
}

export function checkMonitoringToken(
  req: Request
): { ok: true } | { ok: false; response: Response } {
  const configured = process.env.MONITORING_TOKEN;
  if (!configured) {
    return {
      ok: false,
      response: Response.json(
        {
          error: "Integrasi monitoring belum dikonfigurasi di server",
          hint: "Set MONITORING_TOKEN lalu jalankan seed untuk akun monitoring_service",
        },
        { status: 503 }
      ),
    };
  }

  const ip = clientIpFrom(req);
  const got = req.headers.get(MONITORING_TOKEN_HEADER);
  if (!got || got !== configured) {
    // limit kegagalan (5/menit/IP) & flood polling dihentikan sebelum dianggap sah.
    const failGate = checkRateLimit(`monitor-fail:${ip}`, MONITOR_MAX_FAILURES, MONITOR_WINDOW_MS);
    if (!failGate.ok) {
      void recordInvalidTokenAttempt(ip, got);
      return {
        ok: false,
        response: Response.json(
          {
            error: "Terlalu banyak percobaan token monitoring.",
            retryAfterSec: failGate.retryAfterSec,
          },
          { status: 429 }
        ),
      };
    }
    void recordInvalidTokenAttempt(ip, got);
    return {
      ok: false,
      response: Response.json(
        { error: "Token monitoring tidak valid" },
        { status: 401 }
      ),
    };
  }

  // Rate limit panggilan sah: cegah flood polling dari satu IP
  // (120/menit/IP — polling 30s backend masih jauh di dalam batas).
  const read = checkRateLimit(`monitor-read:${ip}`, MONITOR_READ_MAX, MONITOR_WINDOW_MS);
  if (!read.ok) {
    return {
      ok: false,
      response: Response.json(
        { error: `Terlalu banyak request. Coba lagi dalam ${read.retryAfterSec} detik.` },
        { status: 429 }
      ),
    };
  }

  return { ok: true };
}

/** ID akun layanan untuk FK audit. Null = belum di-seed. */
export async function getMonitoringActorId(): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { username: MONITORING_SERVICE_USERNAME },
    select: { id: true },
  });
  return u?.id ?? null;
}
