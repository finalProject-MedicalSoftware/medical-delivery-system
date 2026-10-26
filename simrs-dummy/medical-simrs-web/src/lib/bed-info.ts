/**
 * Tipe dan helper murni seputar info bed.
 * Modul ini SENGAJA tidak mengimpor prisma agar aman diimpor
 * komponen client ("use client"). Query database tetap di
 * bed-availability.ts (khusus server).
 */

export interface BedAvailability {
  id: string;
  bedNumber: string;
  isOccupied: boolean;
  occupantName: string | null;
  free: boolean;
}

export interface RoomAvailability {
  id: string;
  roomCode: string;
  name: string;
  wardName: string;
  beds: BedAvailability[];
  freeCount: number;
}

/**
 * Saring ruang untuk dropdown form pasien.
 * Ruang penuh disembunyikan, kecuali ruang tempat pasien
 * yang sedang diubah berada (agar form edit tetap valid).
 */
export function filterRoomsForDropdown(
  rooms: RoomAvailability[],
  currentRoomCode: string | null
): RoomAvailability[] {
  return rooms.filter(
    (room) => room.freeCount > 0 || (currentRoomCode !== null && room.roomCode === currentRoomCode)
  );
}

/**
 * Label tampilan satu bed untuk form dan detail.
 * Dipakai konsisten di resep, pengantaran, dan bangsal.
 */
export function bedDisplayName(bedNumber: string | null | undefined): string {
  return bedNumber ? `Bed ${bedNumber}` : "-";
}
