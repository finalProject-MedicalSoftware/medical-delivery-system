/**
 * Data identitas & keselamatan untuk HMI robot (dititipkan backend di OP.tray_tasks[].brief.patient).
 *
 * HMI TIDAK menerima nama lengkap atau MRN mentah:
 *  - `mrnHash`  : SHA-256 heksadesimal dari MRN. HMI memindai barcode/QR gelang, meng-hash hasilnya,
 *                 lalu mencocokkan. MRN tidak pernah tersimpan di tablet.
 *  - `initials` : untuk sapaan/konfirmasi ("Apakah Anda B.S.?").
 *  - `allergies`: daftar alergi tercatat, ditampilkan sebagai kartu peringatan sebelum obat dijelaskan.
 *  - `scheduleUrl`: halaman jadwal minum obat untuk keluarga (token berumur pendek, lihat schedule-token.ts).
 *
 * Server-only (node:crypto).
 */
import { createHash } from "node:crypto";
import { signScheduleToken } from "@/lib/schedule-token";
import { patientQrBaseUrl } from "@/lib/wristband";

export function mrnHash(mrn: string): string {
  return createHash("sha256").update(mrn.trim(), "utf8").digest("hex");
}

/** "Budi Santoso" -> "B.S." ; maksimal 3 huruf. */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => `${w[0]!.toUpperCase()}.`)
    .join("");
}

export function familySchedulePath(requestCode: string, token: string): string {
  return `/jadwal/${encodeURIComponent(requestCode)}?t=${encodeURIComponent(token)}`;
}

export function familyScheduleUrl(requestCode: string, baseUrl?: string): string {
  const base = (
    baseUrl ?? patientQrBaseUrl({ QR_BASE_URL: process.env.QR_BASE_URL, NEXTAUTH_URL: process.env.NEXTAUTH_URL })
  ).replace(/\/+$/, "");
  return `${base}${familySchedulePath(requestCode, signScheduleToken(requestCode))}`;
}

export interface HmiBrief {
  patient: { mrnHash: string; initials: string; allergies: string[] };
  scheduleUrl: string;
}

export function hmiBrief(p: { mrn: string; fullName: string; allergies: string[] }, requestCode: string): HmiBrief {
  return {
    patient: {
      mrnHash: mrnHash(p.mrn),
      initials: initials(p.fullName),
      allergies: p.allergies.map((a) => a.trim()).filter(Boolean),
    },
    scheduleUrl: familyScheduleUrl(requestCode),
  };
}
