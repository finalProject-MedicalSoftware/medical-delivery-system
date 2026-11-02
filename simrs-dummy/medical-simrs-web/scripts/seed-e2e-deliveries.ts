import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enqueueOutbox } from "../src/lib/outbox";

/**
 * Seed E2E: pasien ber-bed → obat → resep READY_FOR_DELIVERY → permintaan
 * pengantaran. Meniru createPatientAction / createPrescriptionAction /
 * createDeliveryRequestAction, tapi langsung ke Prisma (tanpa sesi Next).
 *
 * Idempotent per MRN: pasien & bed dipakai ulang, resep + permintaan baru
 * dibuat setiap run. Jalankan `npm run wipe-demo` dulu bila ingin bersih.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const MEDICINES = [
  { code: "MED-PCM-500", name: "Paracetamol 500 mg", unit: "tablet", category: "Analgesik", stock: 240 },
  { code: "MED-AMOX-500", name: "Amoxicillin 500 mg", unit: "kapsul", category: "Antibiotik", stock: 180 },
  { code: "MED-VIT-C", name: "Vitamin C 500 mg", unit: "tablet", category: "Vitamin", stock: 300 },
];

const CASES = [
  {
    mrn: "SYN-E2E-001",
    fullName: "Rina Kartika [SINTETIS]",
    gender: "P",
    dateOfBirth: "1991-04-12",
    diagnosis: "Demam tifoid (fiktif)",
    roomCode: "R-MAWAR-201",
    medicineCode: "MED-PCM-500",
    quantity: 6,
    instructions: "3x1 tablet sesudah makan",
    doseTimes: ["08:00", "13:00", "19:00"],
  },
  {
    mrn: "SYN-E2E-002",
    fullName: "Bayu Nugroho [SINTETIS]",
    gender: "L",
    dateOfBirth: "1985-11-02",
    diagnosis: "Infeksi saluran napas (fiktif)",
    roomCode: "R-MAWAR-202",
    medicineCode: "MED-AMOX-500",
    quantity: 9,
    instructions: "3x1 kapsul sesudah makan",
    doseTimes: ["07:00", "14:00", "21:00"],
  },
  {
    mrn: "SYN-E2E-003",
    fullName: "Sari Wulandari [SINTETIS]",
    gender: "P",
    dateOfBirth: "1998-07-23",
    diagnosis: "Defisiensi vitamin (fiktif)",
    roomCode: "R-MELATI-101",
    medicineCode: "MED-VIT-C",
    quantity: 3,
    instructions: "1x1 tablet pagi",
    doseTimes: ["08:00"],
  },
];

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function actor(username: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new Error(`User '${username}' tidak ada — jalankan npm run db:seed`);
  return user.id;
}

async function upsertMedicine(med: (typeof MEDICINES)[number]): Promise<string> {
  const row = await prisma.medicine.upsert({
    where: { code: med.code },
    create: { ...med, isActive: true },
    update: { name: med.name, unit: med.unit, category: med.category, stock: med.stock, isActive: true },
    select: { id: true },
  });
  return row.id;
}

/** Pasien + klaim bed (bed wajib: roomName pasien di SIMRS berasal dari bed). */
async function upsertPatient(c: (typeof CASES)[number]): Promise<string> {
  const existing = await prisma.patient.findUnique({
    where: { mrn: c.mrn },
    select: { id: true, bedId: true },
  });

  const room = await prisma.room.findUnique({
    where: { roomCode: c.roomCode },
    select: { id: true, roomCode: true, beds: { orderBy: { bedNumber: "asc" }, select: { id: true, bedNumber: true, isOccupied: true } } },
  });
  if (!room) throw new Error(`Ruang '${c.roomCode}' tidak ada`);

  const occupiedBy = await prisma.patient.findFirst({
    where: { bedId: { in: room.beds.map((b) => b.id) }, dischargedAt: null, NOT: { mrn: c.mrn } },
    select: { bedId: true },
  });
  const takenIds = new Set(occupiedBy ? [occupiedBy.bedId] : []);
  const freeBed = room.beds.find((b) => !b.isOccupied && !takenIds.has(b.id));
  const currentBed = existing?.bedId ? room.beds.find((b) => b.id === existing.bedId) : null;
  const bed = currentBed ?? freeBed;
  if (!bed) throw new Error(`Tidak ada bed bebas di ${c.roomCode} untuk ${c.mrn}`);

  return prisma.$transaction(async (tx) => {
    const patient = existing
      ? await tx.patient.update({
          where: { mrn: c.mrn },
          data: {
            fullName: c.fullName,
            gender: c.gender,
            dateOfBirth: new Date(c.dateOfBirth),
            diagnosis: c.diagnosis,
            roomCode: room.roomCode,
            bedId: bed.id,
            dischargedAt: null,
          },
          select: { id: true },
        })
      : await tx.patient.create({
          data: {
            mrn: c.mrn,
            fullName: c.fullName,
            gender: c.gender,
            dateOfBirth: new Date(c.dateOfBirth),
            diagnosis: c.diagnosis,
            roomCode: room.roomCode,
            bedId: bed.id,
            isSynthetic: true,
          },
          select: { id: true },
        });

    await tx.bed.updateMany({ where: { id: bed.id }, data: { isOccupied: true } });
    return patient.id;
  });
}

async function main() {
  const doctorId = await actor("dr_budi");
  const pharmacistId = await actor("apt_dewi");
  const requesterId = await actor("perawat_siti");

  const out: Array<Record<string, string>> = [];

  for (const c of CASES) {
    const medicineId = await upsertMedicine(
      MEDICINES.find((m) => m.code === c.medicineCode) ?? MEDICINES[0]
    );
    const patientId = await upsertPatient(c);

    const rxCount = await prisma.prescription.count({ where: { code: { startsWith: `RX-${today()}` } } });
    const rxCode = `RX-${today()}-${String(rxCount + 1).padStart(4, "0")}`;

    const rx = await prisma.$transaction(async (tx) => {
      const created = await tx.prescription.create({
        data: {
          code: rxCode,
          patientId,
          doctorId,
          status: "READY_FOR_DELIVERY",
          verifiedById: pharmacistId,
          verifiedAt: new Date(),
          notes: "Seed E2E — resep sintetis siap antar",
          doseTimes: c.doseTimes,
          items: { create: [{ medicineId, quantity: c.quantity, instructions: c.instructions }] },
        },
        select: { id: true, code: true },
      });
      await tx.auditLog.create({
        data: {
          entityType: "PRESCRIPTION",
          entityId: created.id,
          action: "CREATE_PRESCRIPTION",
          actorId: doctorId,
          details: { code: created.code, patientId, itemCount: 1, source: "seed-e2e" },
        },
      });
      return created;
    });

    const delivCount = await prisma.deliveryRequest.count({ where: { requestCode: { startsWith: `DELIV-${today()}` } } });
    const requestCode = `DELIV-${today()}-${String(delivCount + 1).padStart(4, "0")}`;

    await prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryRequest.create({
        data: {
          requestCode,
          prescriptionId: rx.id,
          roomCode: c.roomCode,
          requestedById: requesterId,
          notes: "Seed E2E — permintaan pengantaran sintetis",
          status: "DELIVERY_REQUESTED",
        },
        select: { id: true },
      });
      await tx.deliveryEvent.create({
        data: {
          deliveryRequestId: delivery.id,
          eventType: "STATUS_CHANGE",
          statusBefore: null,
          statusAfter: "DELIVERY_REQUESTED",
          actorId: requesterId,
          isSimulation: false,
          notes: "Permintaan pengantaran dibuat (seed E2E)",
        },
      });
      await tx.auditLog.create({
        data: {
          entityType: "DELIVERY_REQUEST",
          entityId: delivery.id,
          action: "CREATE_DELIVERY",
          actorId: requesterId,
          details: { requestCode, prescriptionId: rx.id, roomCode: c.roomCode, source: "seed-e2e" },
        },
      });
      await enqueueOutbox(tx, { requestCode, from: null, to: "DELIVERY_REQUESTED" });
    });

    out.push({ requestCode, mrn: c.mrn, patientName: c.fullName, roomCode: c.roomCode, rxCode });
  }

  console.log("[seed-e2e] permintaan pengantaran dibuat:");
  console.table(out);
  console.log("[seed-e2e] tunggu poll backend SIMRS (~30 dtk) lalu buka /missions/create.");
}

main()
  .catch((e) => {
    console.error("[seed-e2e] gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());