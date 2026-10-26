import prisma from "./prisma";
import {
  bedDisplayName,
  filterRoomsForDropdown,
  type BedAvailability,
  type RoomAvailability,
} from "./bed-info";

export { bedDisplayName, filterRoomsForDropdown, type BedAvailability, type RoomAvailability };

/**
 * Hunian bed live untuk form pasien dan menu bangsal.
 * Sumber kebenaran ganda yang disinkronkan aplikasi:
 * - Bed.isOccupied (flag cepat untuk dropdown dan chip merah).
 * - Relasi Patient.bedId ke pasien aktif (nama penghuni).
 * Bed dianggap bebas hanya bila flag mati DAN tidak ada penghuni aktif.
 */

export async function getRoomsWithBedAvailability(): Promise<RoomAvailability[]> {
  const rooms = await prisma.room.findMany({
    orderBy: { roomCode: "asc" },
    include: {
      ward: { select: { name: true } },
      beds: {
        orderBy: { bedNumber: "asc" },
        include: {
          patients: {
            where: { dischargedAt: null },
            select: { fullName: true },
          },
        },
      },
    },
  });

  return rooms.map((room) => {
    const beds: BedAvailability[] = room.beds.map((bed) => {
      const occupantName = bed.patients[0]?.fullName ?? null;
      return {
        id: bed.id,
        bedNumber: bed.bedNumber,
        isOccupied: bed.isOccupied,
        occupantName,
        free: !bed.isOccupied && occupantName === null,
      };
    });
    return {
      id: room.id,
      roomCode: room.roomCode,
      name: room.name,
      wardName: room.ward.name,
      beds,
      freeCount: beds.filter((b) => b.free).length,
    };
  });
}

/**
 * Interface transaksi minimal untuk klaim/bebas bed.
 * Disengaja sempit agar tidak bergantung pada tipe internal Prisma.
 */
export interface BedClaimTx {
  bed: {
    findUnique(args: {
      where: { id: string };
      include: { room: { select: { roomCode: true } } };
    }): Promise<{
      id: string;
      bedNumber: string;
      isOccupied: boolean;
      room: { roomCode: string };
    } | null>;
    updateMany(args: {
      where: { id: string; isOccupied?: boolean };
      data: { isOccupied: boolean };
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: { isOccupied: boolean };
    }): Promise<unknown>;
  };
  patient: {
    findFirst(args: {
      where: { bedId: string; dischargedAt: null; NOT?: { id: string } };
      select: { id: true; fullName?: true };
    }): Promise<{ id: string; fullName?: string } | null>;
  };
}

/**
 * Klaim satu bed untuk pasien di dalam transaksi pemanggil.
 * Atomic: update bersyarat hanya berhasil bila bed masih bebas,
 * sehingga dua admin yang memilih bed sama tidak bisa double booking.
 */
export async function claimBedForPatient(
  tx: BedClaimTx,
  opts: {
    patientId: string;
    roomCode: string;
    bedId: string;
    previousBedId: string | null;
  }
): Promise<void> {
  const { patientId, roomCode, bedId, previousBedId } = opts;

  if (previousBedId === bedId) {
    // Tetap di bed sendiri: pastikan flag menyala (koreksi bila
    // sempat diubah manual dari menu bangsal).
    await tx.bed.update({ where: { id: bedId }, data: { isOccupied: true } });
    return;
  }

  const bed = await tx.bed.findUnique({
    where: { id: bedId },
    include: { room: { select: { roomCode: true } } },
  });
  if (!bed) {
    throw new Error("Bed tidak ditemukan. Muat ulang form lalu pilih ulang.");
  }
  if (bed.room.roomCode !== roomCode) {
    throw new Error(`Bed ${bed.bedNumber} tidak berada di ruang ${roomCode}.`);
  }

  const claimed = await tx.bed.updateMany({
    where: { id: bedId, isOccupied: false },
    data: { isOccupied: true },
  });
  if (claimed.count === 0) {
    const occupant = await tx.patient.findFirst({
      where: { bedId, dischargedAt: null },
      select: { id: true, fullName: true },
    });
    throw new Error(
      occupant
        ? `Bed ${bed.bedNumber} baru saja terisi oleh ${occupant.fullName}. Pilih bed lain.`
        : `Bed ${bed.bedNumber} tidak tersedia. Pilih bed lain.`
    );
  }

  if (previousBedId) {
    await releaseBedIfUnused(tx, previousBedId, patientId);
  }
}

/**
 * Bebaskan bed bila tidak ada pasien aktif lain yang memakainya.
 */
export async function releaseBedIfUnused(
  tx: BedClaimTx,
  bedId: string,
  exceptPatientId: string
): Promise<void> {
  const other = await tx.patient.findFirst({
    where: { bedId, dischargedAt: null, NOT: { id: exceptPatientId } },
    select: { id: true },
  });
  if (!other) {
    await tx.bed.updateMany({ where: { id: bedId }, data: { isOccupied: false } });
  }
}
