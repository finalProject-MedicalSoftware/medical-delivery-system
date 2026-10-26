import type { DeliveryStatus, PrescriptionStatus } from "@prisma/client";

/**
 * Satu sumber kebenaran untuk label, tone, transisi status pengantaran,
 * dan label status resep. Dulu peta ini ada 4 salinan (ui.tsx, halaman
 * pengantaran, detail resep, route mapping, server action) yang bisa
 * berbeda satu dengan lain; semua sekarang baca dari sini.
 *
 * Aturan label: kode status dengan awalan `MOCK_` WAJIB memuat `[MOCK]`
 * supaya perilaku simulasi fase mock tidak terbaca seolah kenyataan klinis.
 *
 * Modul ini sengaja prisma-free (import type saja, tanpa impor runtime
 * prisma/fs) supaya boleh dipakai komponen server maupun client.
 */

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  DELIVERY_REQUESTED: "Diminta",
  PENDING_INTEGRATION: "Pending Integrasi",
  MOCK_IN_TRANSIT: "[MOCK] Transit",
  MOCK_ARRIVED_AT_ROOM: "[MOCK] Tiba",
  MOCK_HANDOVER_CONFIRMED: "[MOCK] Serah Terima",
  CANCELLED: "Dibatalkan",
};

export const DELIVERY_STATUS_TONES: Record<DeliveryStatus, string> = {
  DELIVERY_REQUESTED: "sky",
  PENDING_INTEGRATION: "amber",
  MOCK_IN_TRANSIT: "sky",
  MOCK_ARRIVED_AT_ROOM: "emerald",
  MOCK_HANDOVER_CONFIRMED: "teal",
  CANCELLED: "slate",
};

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  VERIFIED: "Diverifikasi",
  REJECTED: "Ditolak",
  PREPARING: "Disiapkan",
  READY_FOR_DELIVERY: "Siap Kirim",
  CANCELLED: "Dibatalkan",
};

/**
 * Transisi status pengantaran yang sah di server (UI + endpoint monitoring
 * memakai bagian/derive dari tabel yang sama). Satu-satunya jalur ke
 * MOCK_HANDOVER_CONFIRMED adalah konfirmasi serah-terima manusia lewat
 * halaman /scan/[mrn]; monitoring/desktop TIDAK boleh melompat langsung.
 */
export const DELIVERY_TRANSITIONS: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  DELIVERY_REQUESTED: ["PENDING_INTEGRATION", "CANCELLED"],
  PENDING_INTEGRATION: ["MOCK_IN_TRANSIT", "CANCELLED"],
  MOCK_IN_TRANSIT: ["MOCK_ARRIVED_AT_ROOM", "CANCELLED"],
  // Serah-terima hanya dari scan QR, bukan tombol UI / lemparan monitoring.
  MOCK_ARRIVED_AT_ROOM: ["MOCK_HANDOVER_CONFIRMED"],
};

/** Status pengantaran yang masih berjalan (untuk read API monitoring). */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  "DELIVERY_REQUESTED",
  "PENDING_INTEGRATION",
  "MOCK_IN_TRANSIT",
  "MOCK_ARRIVED_AT_ROOM",
];

// Cast ke Record<string,...> hanya dilakukan di titik ini agar pemanggil
// tidak perlu men-cast kode string tak dikenal di banyak file.
function lookup<K extends string>(
  code: string,
  map: Record<K, string>,
  fallback: string
): string {
  return (map as Record<string, string>)[code] ?? fallback;
}

/** Label delivery untuk kode string apa pun; kode tak dikenal balik ke fallback. */
export function deliveryStatusLabel(code: string, fallback = code): string {
  return lookup(code, DELIVERY_STATUS_LABELS, fallback);
}

/** Tone delivery (slate/sky/emerald/amber/teal); fallback "slate". */
export function deliveryStatusTone(code: string, fallback = "slate"): string {
  return lookup(code, DELIVERY_STATUS_TONES, fallback);
}

/** Label resep untuk kode string apa pun; kode tak dikenal balik ke fallback. */
export function prescriptionStatusLabel(code: string, fallback = code): string {
  return lookup(code, PRESCRIPTION_STATUS_LABELS, fallback);
}
