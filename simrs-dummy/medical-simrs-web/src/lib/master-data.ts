import prisma from "./prisma";
import { claimBedForPatient } from "./bed-availability";
import { patientSchema, roomSchema, medicineSchema } from "./validations";
import { z } from "zod";

// ==========================================
// 1. Synthetic Patients
// ==========================================

export async function getPatients() {
  return await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      prescriptions: {
        select: { id: true, code: true, status: true },
      },
    },
  });
}

export async function getPatientById(id: string) {
  return await prisma.patient.findUnique({
    where: { id },
    include: {
      prescriptions: {
        include: {
          items: { include: { medicine: true } },
          doctor: { select: { fullName: true } },
        },
      },
    },
  });
}

export async function createPatient(data: z.infer<typeof patientSchema>, actorId?: string) {
  const parsed = patientSchema.parse(data);

  // Check unique MRN
  const existing = await prisma.patient.findUnique({ where: { mrn: parsed.mrn } });
  if (existing) {
    throw new Error(`Pasien dengan nomor MRN '${parsed.mrn}' sudah terdaftar`);
  }

  // Tanpa ruang tidak ada bed. Bed wajib divalidasi milik ruang terpilih
  // dan diklaim atomik di transaksi yang sama (anti double booking).
  const bedId = parsed.roomCode ? (parsed.bedId ?? null) : null;
  if (parsed.roomCode && !bedId) {
    throw new Error(`Pilih bed untuk ruang ${parsed.roomCode}. Bila penuh, pilih ruang lain.`);
  }

  // Pasien dan audit ditulis dalam satu transaksi agar kegagalan audit
  // (mis. actorId basi) membatalkan pembuatan pasien juga.
  const patient = await prisma.$transaction(async (tx) => {
    const created = await tx.patient.create({
      data: {
        mrn: parsed.mrn,
        fullName: parsed.fullName,
        dateOfBirth: new Date(parsed.dateOfBirth),
        gender: parsed.gender,
        roomCode: parsed.roomCode,
        bedId,
        notes: parsed.notes,
        diagnosis: parsed.diagnosis,
        isInfectious: parsed.isInfectious,
        isSynthetic: true, // Always enforce synthetic label
      },
    });

    if (bedId && parsed.roomCode) {
      await claimBedForPatient(tx, {
        patientId: created.id,
        roomCode: parsed.roomCode,
        bedId,
        previousBedId: null,
      });
    }

    if (actorId) {
      await tx.auditLog.create({
        data: {
          entityType: "PATIENT",
          entityId: created.id,
          action: "CREATE_PATIENT",
          actorId,
          details: { mrn: created.mrn, fullName: created.fullName },
        },
      });
    }

    return created;
  });

  return patient;
}

// ==========================================
// 2. Wards, Rooms, and Beds
// ==========================================

export async function getWards() {
  return await prisma.ward.findMany({
    orderBy: { floor: "asc" },
    include: {
      rooms: {
        include: {
          beds: true,
        },
      },
    },
  });
}

export async function getRooms() {
  return await prisma.room.findMany({
    orderBy: { roomCode: "asc" },
    include: {
      ward: true,
      beds: true,
    },
  });
}

export async function getRoomByCode(roomCode: string) {
  return await prisma.room.findUnique({
    where: { roomCode },
    include: {
      ward: true,
      beds: true,
    },
  });
}

export async function createRoom(data: z.infer<typeof roomSchema>, actorId?: string) {
  const parsed = roomSchema.parse(data);

  // Check unique roomCode
  const existing = await prisma.room.findUnique({ where: { roomCode: parsed.roomCode } });
  if (existing) {
    throw new Error(`Ruang dengan kode '${parsed.roomCode}' sudah ada. Kode ruang harus unik.`);
  }

  const ward = await prisma.ward.findUnique({ where: { id: parsed.wardId } });
  if (!ward) {
    throw new Error(`Bangsal dengan ID '${parsed.wardId}' tidak ditemukan.`);
  }

  const room = await prisma.room.create({
    data: {
      wardId: parsed.wardId,
      roomCode: parsed.roomCode,
      name: parsed.name,
      beds: {
        create: [{ bedNumber: "A" }, { bedNumber: "B" }],
      },
    },
    include: { beds: true },
  });

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        entityType: "ROOM",
        entityId: room.id,
        action: "CREATE_ROOM",
        actorId,
        details: { roomCode: room.roomCode, name: room.name },
      },
    });
  }

  return room;
}

// ==========================================
// 3. Medicines Catalogue
// ==========================================

export async function getMedicines() {
  return await prisma.medicine.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getMedicineById(id: string) {
  return await prisma.medicine.findUnique({
    where: { id },
  });
}

export async function createMedicine(data: z.infer<typeof medicineSchema>, actorId?: string) {
  const parsed = medicineSchema.parse(data);

  const existing = await prisma.medicine.findUnique({ where: { code: parsed.code } });
  if (existing) {
    throw new Error(`Obat dengan kode '${parsed.code}' sudah terdaftar.`);
  }

  const medicine = await prisma.medicine.create({
    data: {
      code: parsed.code,
      name: parsed.name,
      unit: parsed.unit,
      category: parsed.category,
      stock: parsed.stock,
      isActive: true,
    },
  });

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        entityType: "MEDICINE",
        entityId: medicine.id,
        action: "CREATE_MEDICINE",
        actorId,
        details: { code: medicine.code, name: medicine.name },
      },
    });
  }

  return medicine;
}

export async function updateMedicineStock(medicineId: string, quantityDelta: number, actorId?: string) {
  const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!medicine) {
    throw new Error("Obat tidak ditemukan");
  }

  const newStock = medicine.stock + quantityDelta;
  if (newStock < 0) {
    throw new Error(`Stok obat ${medicine.name} tidak mencukupi (sisa ${medicine.stock}, dibutuhkan ${Math.abs(quantityDelta)})`);
  }

  const updated = await prisma.medicine.update({
    where: { id: medicineId },
    data: { stock: newStock },
  });

  if (actorId) {
    await prisma.auditLog.create({
      data: {
        entityType: "MEDICINE_STOCK",
        entityId: medicineId,
        action: "UPDATE_STOCK",
        actorId,
        details: { previousStock: medicine.stock, newStock, delta: quantityDelta },
      },
    });
  }

  return updated;
}
