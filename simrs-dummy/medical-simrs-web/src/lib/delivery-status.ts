import type { DeliveryStatus, PrescriptionStatus } from "@prisma/client";

/**
 * Satu sumber kebenaran untuk label, tone, transisi status pengantaran,
 * dan label status resep. Dulu peta ini ada 4 salinan (ui.tsx, halaman
 * pengantaran, detail resep, route mapping, server action) yang bisa
 * berbeda satu dengan lain; semua sekarang baca dari sini.
 *
 * Kode status adalah nilai kontrak (wire) yang dipakai backend/dashboard; label
 * tampilan memakai bahasa operasional RS. (Awalan MOCK_ dihapus; nama lama masih
 * diterima pada input POST /monitoring/delivery-status selama masa transisi.)
 *
 * Modul ini sengaja prisma-free (import type saja, tanpa impor runtime
 * prisma/fs) supaya boleh dipakai komponen server maupun client.
 */

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  DELIVERY_REQUESTED: "Belum dikirim ke robot",
  PENDING_INTEGRATION: "Menunggu Robot",
  IN_TRANSIT: "Dalam Perjalanan",
  ARRIVED_AT_ROOM: "Tiba di Ruangan",
  HANDOVER_CONFIRMED: "Serah Terima Selesai",
  NOT_COLLECTED: "Obat Tidak Diambil",
  CANCELLED: "Dibatalkan",
};

export const DELIVERY_STATUS_TONES: Record<DeliveryStatus, string> = {
  DELIVERY_REQUESTED: "sky",
  PENDING_INTEGRATION: "amber",
  IN_TRANSIT: "sky",
  ARRIVED_AT_ROOM: "emerald",
  HANDOVER_CONFIRMED: "teal",
  NOT_COLLECTED: "rose",
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
 * HANDOVER_CONFIRMED adalah konfirmasi serah-terima manusia lewat
 * halaman /scan/[mrn]; monitoring/desktop TIDAK boleh melompat langsung.
 */
export const DELIVERY_TRANSITIONS: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  DELIVERY_REQUESTED: ["PENDING_INTEGRATION", "CANCELLED"],
  PENDING_INTEGRATION: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED_AT_ROOM", "CANCELLED"],
  // Serah-terima hanya dari scan QR, bukan tombol UI / lemparan monitoring.
  // NOT_COLLECTED boleh dilaporkan robot/backend (timeout pengambilan); terminal.
  ARRIVED_AT_ROOM: ["HANDOVER_CONFIRMED", "NOT_COLLECTED"],
};

/** Status pengantaran yang masih berjalan (untuk read API monitoring). */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  "DELIVERY_REQUESTED",
  "PENDING_INTEGRATION",
  "IN_TRANSIT",
  "ARRIVED_AT_ROOM",
];

/**
 * Pengantaran baru masuk web monitoring setelah petugas menekan "Kirim ke Robot"
 * (DELIVERY_REQUESTED -> PENDING_INTEGRATION). Sebelum itu hanya terlihat di SIMRS.
 * Pembatalan sebelum dikirim juga tidak pernah diketahui monitoring.
 */
export const MONITORING_ACTIVE_STATUSES: DeliveryStatus[] = ACTIVE_DELIVERY_STATUSES.filter(
  (s) => s !== "DELIVERY_REQUESTED"
);

/** Filter Prisma: pengantaran yang boleh dilihat monitoring/robot/HMI. */
export const MONITORING_VISIBLE_WHERE = {
  OR: [
    {
      status: {
        in: [
          "PENDING_INTEGRATION",
          "IN_TRANSIT",
          "ARRIVED_AT_ROOM",
          "HANDOVER_CONFIRMED",
          "NOT_COLLECTED",
        ] as DeliveryStatus[],
      },
    },
    {
      status: "CANCELLED" as DeliveryStatus,
      events: { some: { statusAfter: "PENDING_INTEGRATION" } },
    },
  ],
};

/** Versi murni dari MONITORING_VISIBLE_WHERE (untuk tes dan kode non-Prisma). */
export function isMonitoringVisible(status: string, wasDispatched: boolean): boolean {
  if (status === "DELIVERY_REQUESTED") return false;
  if (status === "CANCELLED") return wasDispatched;
  return true;
}

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
