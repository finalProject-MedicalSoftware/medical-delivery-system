/**
 * Token halaman jadwal minum obat untuk keluarga (`/jadwal/{requestCode}?t=<token>`).
 *
 * QR ini ditampilkan HMI robot di akhir penjelasan obat. Halaman jadwal tidak memuat
 * nama lengkap atau MRN (hanya inisial + jadwal obat), dan hanya terbuka dengan token
 * `exp.sig` (HMAC-SHA256 atas `jadwal:{requestCode}:{exp}`) yang berumur pendek.
 * Prefiks `jadwal:` memisahkan token ini dari token scan gelang (qr-token.ts).
 *
 * Server-only (node:crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Default 3 hari: cukup untuk keluarga menyimpan jadwal, tidak berlaku selamanya. */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 3;

function secret(): string {
  return (
    process.env.QR_SIGNING_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "simrs_dummy_local_secret_key_development_only_2026"
  );
}

function sign(requestCode: string, exp: number): string {
  return createHmac("sha256", secret()).update(`jadwal:${requestCode}:${exp}`).digest("base64url");
}

function ttlSeconds(): number {
  const raw = Number(process.env.SCHEDULE_TOKEN_TTL_SECONDS);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

export function signScheduleToken(requestCode: string, ttl = ttlSeconds(), now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttl;
  return `${exp}.${sign(requestCode, exp)}`;
}

export function verifyScheduleToken(requestCode: string, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now) return false;
  const given = Buffer.from(token.slice(dot + 1), "utf-8");
  const expected = Buffer.from(sign(requestCode, exp), "utf-8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
