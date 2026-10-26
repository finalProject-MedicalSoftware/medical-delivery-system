/**
 * Token tanda tangan untuk URL scan gelang pasien.
 *
 * MRN mudah ditebak/diurutkan, dan foto gelang bisa dipakai ulang selamanya.
 * Karena itu QR membawa token `exp.sig` (HMAC-SHA256 atas `mrn:exp`) dengan
 * masa berlaku terbatas; halaman scan menolak MRN tanpa token valid.
 *
 * Server-only (node:crypto).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Default 30 hari: gelang yang dicetak lebih dulu tetap bisa dipindai saat demo. */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  return (
    process.env.QR_SIGNING_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "simrs_dummy_local_secret_key_development_only_2026"
  );
}

function sign(mrn: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${mrn}:${exp}`).digest("base64url");
}

function ttlSeconds(): number {
  const raw = Number(process.env.QR_TOKEN_TTL_SECONDS);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/** Token `<exp>.<sig>` untuk satu MRN. */
export function signScanToken(mrn: string, ttl = ttlSeconds()): string {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  return `${exp}.${sign(mrn, exp)}`;
}

/** true hanya bila token cocok dengan MRN dan belum kedaluwarsa. */
export function verifyScanToken(mrn: string, token: string | undefined): boolean {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isSafeInteger(exp) || exp * 1000 <= Date.now()) return false;

  const given = Buffer.from(token.slice(dot + 1), "utf-8");
  const expected = Buffer.from(sign(mrn, exp), "utf-8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
