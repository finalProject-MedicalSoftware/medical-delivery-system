/**
 * Utilitas QR gelang pasien.
 *
 * QR hanya berisi URL halaman konfirmasi serah-terima (/scan/{mrn}?t=token),
 * bukan data rekam medis. Data pasien tetap diambil dari server
 * setelah petugas login memindai QR.
 *
 * Server-only: token ditandatangani dengan node:crypto (lihat qr-token.ts).
 */
import { signScanToken } from "@/lib/qr-token";

/** Path halaman konfirmasi serah-terima untuk satu pasien. */
export function patientScanPath(mrn: string, token?: string): string {
  const path = `/scan/${encodeURIComponent(mrn)}`;
  return token ? `${path}?t=${encodeURIComponent(token)}` : path;
}

/**
 * Base URL untuk konten QR: pakai QR_BASE_URL bila diisi,
 * lalu NEXTAUTH_URL, terakhir localhost (mode demo lokal).
 * QR_BASE_URL berguna saat URL publik berbeda dari URL auth.
 */
export function patientQrBaseUrl(env: {
  QR_BASE_URL?: string | undefined;
  NEXTAUTH_URL?: string | undefined;
}): string {
  const fromQr = env.QR_BASE_URL?.trim();
  if (fromQr) return fromQr;
  const fromAuth = env.NEXTAUTH_URL?.trim();
  if (fromAuth) return fromAuth;
  return "http://localhost:3000";
}

/** URL lengkap yang dicetak sebagai QR pada gelang. */
export function patientQrUrl(mrn: string, baseUrl?: string): string {
  const base = (
    baseUrl ??
    patientQrBaseUrl({
      QR_BASE_URL: process.env.QR_BASE_URL,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    })
  ).replace(/\/+$/, "");
  return `${base}${patientScanPath(mrn, signScanToken(mrn))}`;
}
