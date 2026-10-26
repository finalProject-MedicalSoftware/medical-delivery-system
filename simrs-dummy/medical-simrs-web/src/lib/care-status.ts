/**
 * Status perawatan pasien untuk tabel /pasien.
 * - selesai: dischargedAt terisi (masuk tab Riwayat).
 * - dirawat: aktif dan punya ruang (masuk tab Dirawat).
 * - rawat-jalan: aktif tanpa ruang, misalnya kunjungan yang belum
 *   punya resep dan belum ditandai selesai (hanya terlihat di tab Semua).
 */
export type PatientCareStatus = "dirawat" | "rawat-jalan" | "selesai";

export function getCareStatus(patient: {
  dischargedAt: Date | string | null;
  roomCode: string | null;
}): PatientCareStatus {
  if (patient.dischargedAt) return "selesai";
  if (patient.roomCode) return "dirawat";
  return "rawat-jalan";
}

export const CARE_STATUS_LABEL: Record<PatientCareStatus, string> = {
  dirawat: "Dirawat",
  "rawat-jalan": "Rawat jalan",
  selesai: "Selesai",
};
