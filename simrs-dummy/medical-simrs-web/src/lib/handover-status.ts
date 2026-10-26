/**
 * Aturan murni serah-terima (handover).
 * Modul ini SENGAJA tidak mengimpor prisma agar bisa diuji tanpa DATABASE_URL.
 * Query database ada di handover.ts (khusus server).
 */

/** Robot harus sudah tiba di ruang sebelum serah-terima boleh dikonfirmasi. */
export function canConfirmHandover(status: string): boolean {
  return status === "MOCK_ARRIVED_AT_ROOM";
}
