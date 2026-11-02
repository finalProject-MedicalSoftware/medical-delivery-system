import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Wipe data demo/transaksional SIMRS (idempotent).
 * KEEP (master struktur & auth, tanpa UI CRUD): m_user, m_role, m_user_role,
 * m_permission, m_role_permission, m_ward, m_room, m_bed.
 * HAPUS (urut FK): OutboxEvent → DeliveryEvent → DeliveryRequest →
 * PrescriptionItem → Prescription → AuditLog → Patient → Medicine.
 * Ganti password user juga tidak diubah — hanya data demo yang hilang.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Pasien demo dihapus; flag `is_occupied` di m_bed (KEEP — master data)
 * akan menjadi dangling karena menunjuk pasien yang tak ada lagi.
 * Semua bed di-reset ke kosong agar `seed-e2e` selalu menemukan bed bebas.
 * Baris m_bed dipertahankan; hanya flag okupansinya yang direset.
 */
async function main() {
  const deleted = {
    outboxEvent: await prisma.outboxEvent.deleteMany(),
    deliveryEvent: await prisma.deliveryEvent.deleteMany(),
    deliveryRequest: await prisma.deliveryRequest.deleteMany(),
    prescriptionItem: await prisma.prescriptionItem.deleteMany(),
    prescription: await prisma.prescription.deleteMany(),
    auditLog: await prisma.auditLog.deleteMany(),
    patient: await prisma.patient.deleteMany(),
    medicine: await prisma.medicine.deleteMany(),
  };
  const bedReset = await prisma.bed.updateMany({ data: { isOccupied: false } });
  console.log(`[wipe-demo-data] bed isOccupied reset: ${bedReset.count} baris`);

  console.log("[wipe-demo-data] selesai. Baris terhapus per tabel:");
  for (const [model, res] of Object.entries(deleted)) {
    console.log(`  ${model}: ${res.count}`);
  }
  console.log(
    "[wipe-demo-data] KEEP: User/Role/UserRole/Permission/RolePermission/Ward/Room/Bed tidak dihapus; flag okupansi m_bed direset ke kosong.",
  );
}

main()
  .catch((e) => {
    console.error("[wipe-demo-data] gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
