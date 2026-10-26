import "dotenv/config";
import { PrismaClient, PrescriptionStatus, DeliveryStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in environment variables");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Memulai seeding data SIMRS Dummy (Data Sintetis)...");

  // 1. Roles
  const rolesData = [
    { code: "SYSTEM_ADMIN", name: "System Administrator", description: "Operasi teknis dan administrasi sistem" },
    { code: "SIMRS_ADMIN", name: "SIMRS Administrator", description: "Pengelolaan master data rumah sakit dummy" },
    { code: "DOCTOR", name: "Dokter Penanggung Jawab", description: "Membuat dan meninjau resep simulasi" },
    { code: "PHARMACIST", name: "Apoteker Farmasi", description: "Verifikasi resep dan validasi penyiapan obat" },
    { code: "PHARMACY_STAFF", name: "Staf Penyiapan Obat", description: "Menyiapkan obat fisik dummy dan pembaruan status" },
    { code: "NURSE", name: "Perawat Rawat Inap", description: "Melihat instruksi obat dan mengajukan permintaan pengantaran" },
    { code: "WARD_ADMIN", name: "Administrator Bangsal", description: "Pengelolaan bangsal, ruang, dan bed sintetis" },
  ];

  const createdRoles: Record<string, string> = {};
  for (const r of rolesData) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
    createdRoles[r.code] = role.id;
  }
  console.log(`✅ Roles seeded (${Object.keys(createdRoles).length} roles)`);

  // 2. Permissions
  const permissionsData = [
    { code: "admin:access", name: "Akses Admin", description: "Akses menu konfigurasi teknis" },
    { code: "admin:roles", name: "Kelola Role Akun", description: "Menetapkan atau mencabut role user" },
    { code: "master:manage", name: "Kelola Master Data", description: "Mengubah data pasien, ruang, obat" },
    { code: "prescription:create", name: "Buat Resep", description: "Membuat draft resep baru" },
    { code: "prescription:read", name: "Lihat Resep", description: "Membaca data resep pasien" },
    { code: "prescription:verify", name: "Verifikasi Resep", description: "Apoteker memverifikasi atau menolak resep" },
    { code: "prescription:prepare", name: "Siapkan Obat", description: "Memperbarui status penyiapan obat" },
    { code: "delivery:create", name: "Buat Permintaan Pengantaran", description: "Mengajukan pengantaran obat siap kirim" },
    { code: "delivery:read", name: "Lihat Permintaan Pengantaran", description: "Melihat status dan riwayat pengantaran" },
    { code: "audit:read", name: "Lihat Audit Trail", description: "Membaca audit log sistem" },
  ];

  const createdPermissions: Record<string, string> = {};
  for (const p of permissionsData) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description },
      create: p,
    });
    createdPermissions[p.code] = perm.id;
  }

  // 3. RolePermission mapping
  const rolePermissionMap: Record<string, string[]> = {
    SYSTEM_ADMIN: Object.keys(createdPermissions),
    SIMRS_ADMIN: ["master:manage", "prescription:read", "delivery:read", "audit:read"],
    DOCTOR: ["prescription:create", "prescription:read", "delivery:read"],
    PHARMACIST: ["prescription:read", "prescription:verify", "prescription:prepare", "delivery:create", "delivery:read"],
    PHARMACY_STAFF: ["prescription:read", "prescription:prepare", "delivery:create", "delivery:read"],
    NURSE: ["prescription:read", "delivery:create", "delivery:read"],
    WARD_ADMIN: ["master:manage", "delivery:read"],
  };

  for (const [roleCode, permCodes] of Object.entries(rolePermissionMap)) {
    const roleId = createdRoles[roleCode];
    for (const permCode of permCodes) {
      const permissionId = createdPermissions[permCode];
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId, permissionId },
        },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }
  console.log("✅ Role-Permission mappings seeded");

  // 4. Demo Users (Hashed password: demo12345)
  const defaultPasswordHash = bcrypt.hashSync("demo12345", 10);

  const usersData: {
    username: string;
    fullName: string;
    email: string;
    roles: string[];
    isActive?: boolean;
  }[] = [
    {
      username: "sysadmin",
      fullName: "Admin Sistem (DEMO)",
      email: "sysadmin@simrs.local",
      roles: ["SYSTEM_ADMIN"],
    },
    {
      username: "admin_simrs",
      fullName: "Siti Rahma - Admin SIMRS (DEMO)",
      email: "adminsimrs@simrs.local",
      roles: ["SIMRS_ADMIN"],
    },
    {
      username: "dr_budi",
      fullName: "dr. Budi Santoso, Sp.A (DEMO)",
      email: "dr.budi@simrs.local",
      roles: ["DOCTOR"],
    },
    {
      username: "apt_dewi",
      fullName: "apt. Dewi Lestari, S.Farm (DEMO)",
      email: "apt.dewi@simrs.local",
      roles: ["PHARMACIST"],
    },
    {
      username: "staf_farmasi",
      fullName: "Eko Prasetyo - Staf Farmasi (DEMO)",
      email: "eko.farmasi@simrs.local",
      roles: ["PHARMACY_STAFF"],
    },
    {
      username: "perawat_siti",
      fullName: "Ns. Siti Nurhaliza, S.Kep (DEMO)",
      email: "perawat.siti@simrs.local",
      roles: ["NURSE"],
    },
    {
      username: "admin_bangsal",
      fullName: "Agus Pratama - Admin Bangsal (DEMO)",
      email: "agus.bangsal@simrs.local",
      roles: ["WARD_ADMIN"],
    },
    // Multi-role demo account: 1 user with DOCTOR & PHARMACIST roles!
    {
      username: "multirole_user",
      fullName: "dr. Hendra Wijaya, Sp.Farm (DEMO Multi-Role)",
      email: "hendra.multirole@simrs.local",
      roles: ["DOCTOR", "PHARMACIST"],
    },
    // Akun layanan integrasi monitoring: tanpa role, non-login,
    // hanya sebagai FK audit untuk status yang dilempar monitoring.
    {
      username: "monitoring_service",
      fullName: "Monitoring Service (SYSTEM)",
      email: "monitoring@simrs.local",
      roles: [],
      isActive: false,
    },
  ];

  const createdUsers: Record<string, string> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        fullName: u.fullName,
        email: u.email,
        passwordHash: defaultPasswordHash,
        isActive: u.isActive ?? true,
      },
      create: {
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        passwordHash: defaultPasswordHash,
        isActive: u.isActive ?? true,
      },
    });
    createdUsers[u.username] = user.id;

    // Assign roles in UserRole
    for (const rCode of u.roles) {
      const roleId = createdRoles[rCode];
      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId },
        },
        update: {},
        create: { userId: user.id, roleId },
      });
    }
  }
  console.log(`✅ Demo users seeded (${Object.keys(createdUsers).length} users, including multi-role account)`);

  // 5. Wards & Rooms
  const melati = await prisma.ward.upsert({
    where: { code: "WARD-MELATI" },
    update: { name: "Bangsal Melati", floor: 2 },
    create: { code: "WARD-MELATI", name: "Bangsal Melati", floor: 2 },
  });

  const mawar = await prisma.ward.upsert({
    where: { code: "WARD-MAWAR" },
    update: { name: "Bangsal Mawar", floor: 3 },
    create: { code: "WARD-MAWAR", name: "Bangsal Mawar", floor: 3 },
  });

  const roomsData = [
    { roomCode: "R-MELATI-101", name: "Ruang Melati 101", wardId: melati.id },
    { roomCode: "R-MELATI-102", name: "Ruang Melati 102", wardId: melati.id },
    { roomCode: "R-MAWAR-201", name: "Ruang Mawar 201", wardId: mawar.id },
    { roomCode: "R-MAWAR-202", name: "Ruang Mawar 202", wardId: mawar.id },
  ];

  for (const rm of roomsData) {
    const room = await prisma.room.upsert({
      where: { roomCode: rm.roomCode },
      update: { name: rm.name, wardId: rm.wardId },
      create: rm,
    });

    // Create Beds
    for (const b of ["A", "B"]) {
      await prisma.bed.upsert({
        where: {
          roomId_bedNumber: { roomId: room.id, bedNumber: b },
        },
        update: {},
        create: {
          roomId: room.id,
          bedNumber: b,
          isOccupied: false,
        },
      });
    }
  }
  console.log("✅ Wards, Rooms (stable room_code), and Beds seeded");

  // 6. Synthetic Patients
  const patientsData = [
    {
      mrn: "SYN-MRN-001",
      fullName: "Bpk. Fiktif Sugiarto (DEMO)",
      dateOfBirth: new Date("1980-05-15"),
      gender: "L",
      roomCode: "R-MELATI-101",
      notes: "Pasien sintetis demo ruang Melati 101",
      isSynthetic: true,
    },
    {
      mrn: "SYN-MRN-002",
      fullName: "Ibu Fiktif Ratnasari (DEMO)",
      dateOfBirth: new Date("1988-11-20"),
      gender: "P",
      roomCode: "R-MELATI-102",
      notes: "Pasien sintetis demo ruang Melati 102",
      isSynthetic: true,
    },
    {
      mrn: "SYN-MRN-003",
      fullName: "Ananda Fiktif Pratama (DEMO)",
      dateOfBirth: new Date("2015-08-01"),
      gender: "L",
      roomCode: "R-MAWAR-201",
      notes: "Pasien sintetis anak demo ruang Mawar 201",
      isSynthetic: true,
    },
  ];

  const createdPatients: Record<string, string> = {};
  for (const p of patientsData) {
    const patient = await prisma.patient.upsert({
      where: { mrn: p.mrn },
      update: p,
      create: p,
    });
    createdPatients[p.mrn] = patient.id;
  }
  console.log("✅ Synthetic patients seeded");

  // 6b. Tautkan pasien seed yang aktif dan beruang ke satu bed bebas.
  // Idempoten: hanya mengisi yang belum tertaut atau tautannya tidak cocok ruang.
  for (const mrn of Object.keys(createdPatients)) {
    const p = await prisma.patient.findUnique({
      where: { id: createdPatients[mrn] },
      include: { bed: { include: { room: { select: { roomCode: true } } } } },
    });
    if (!p || p.dischargedAt || !p.roomCode) continue;
    if (p.bedId && p.bed?.room.roomCode === p.roomCode) continue;
    if (p.bedId) {
      await prisma.bed.updateMany({ where: { id: p.bedId }, data: { isOccupied: false } });
    }
    const freeBed = await prisma.bed.findFirst({
      where: { isOccupied: false, room: { roomCode: p.roomCode } },
      orderBy: { bedNumber: "asc" },
    });
    if (!freeBed) {
      console.log(`⚠️ Ruang ${p.roomCode} penuh, pasien seed ${mrn} tanpa bed`);
      continue;
    }
    await prisma.$transaction([
      prisma.patient.update({ where: { id: p.id }, data: { bedId: freeBed.id } }),
      prisma.bed.update({ where: { id: freeBed.id }, data: { isOccupied: true } }),
    ]);
  }
  console.log("✅ Seed beds linked to active patients");

  // 7. Synthetic Medicines
  const medicinesData = [
    { code: "MED-PCM-500", name: "Paracetamol 500mg Tablet", unit: "tablet", category: "Analgesik / Antipiretik", stock: 250 },
    { code: "MED-AMX-500", name: "Amoxicillin 500mg Kapsul", unit: "kapsul", category: "Antibiotik", stock: 180 },
    { code: "MED-CTM-004", name: "Chlorpheniramine 4mg Tablet", unit: "tablet", category: "Antihistamin", stock: 300 },
    { code: "MED-OMP-020", name: "Omeprazole 20mg Kapsul", unit: "kapsul", category: "Antasida & PPI", stock: 150 },
    { code: "MED-IV-NS500", name: "Cairan Infus Normal Saline 0.9% 500ml", unit: "botol", category: "Cairan Intravena", stock: 80 },
  ];

  const createdMedicines: Record<string, string> = {};
  for (const m of medicinesData) {
    const med = await prisma.medicine.upsert({
      where: { code: m.code },
      update: m,
      create: m,
    });
    createdMedicines[m.code] = med.id;
  }
  console.log("✅ Synthetic medicines catalogue seeded");

  // 8. One initial workflow demonstration
  const demoPrescription = await prisma.prescription.upsert({
    where: { code: "RX-DEMO-001" },
    update: {},
    create: {
      code: "RX-DEMO-001",
      patientId: createdPatients["SYN-MRN-001"],
      doctorId: createdUsers["dr_budi"],
      status: PrescriptionStatus.READY_FOR_DELIVERY,
      verifiedById: createdUsers["apt_dewi"],
      verifiedAt: new Date(),
      notes: "Contoh resep siap diantar ke Melati 101",
      items: {
        create: [
          {
            medicineId: createdMedicines["MED-PCM-500"],
            quantity: 10,
            instructions: "3x1 tablet sesudah makan bila demam/nyeri",
          },
          {
            medicineId: createdMedicines["MED-OMP-020"],
            quantity: 10,
            instructions: "1x1 kapsul 30 menit sebelum sarapan",
          },
        ],
      },
    },
  });

  const demoDelivery = await prisma.deliveryRequest.upsert({
    where: { requestCode: "DELIV-DEMO-001" },
    update: {},
    create: {
      requestCode: "DELIV-DEMO-001",
      prescriptionId: demoPrescription.id,
      roomCode: "R-MELATI-101",
      requestedById: createdUsers["perawat_siti"],
      status: DeliveryStatus.DELIVERY_REQUESTED,
      notes: "Pengantaran obat paket demo siap kirim ke Ruang Melati 101",
      events: {
        create: [
          {
            eventType: "REQUEST_CREATED",
            statusBefore: null,
            statusAfter: "DELIVERY_REQUESTED",
            isSimulation: true,
            actorId: createdUsers["perawat_siti"],
            notes: "Permintaan pengantaran obat dibuat dari aplikasi SIMRS",
          },
        ],
      },
    },
  });

  // 9. Initial Audit Log
  await prisma.auditLog.create({
    data: {
      action: "SYSTEM_SEED",
      entityType: "SYSTEM",
      entityId: "seed-init",
      actorId: createdUsers["sysadmin"],
      details: {
        info: "Seed data awal sistem dieksekusi",
        timestamp: new Date().toISOString(),
      },
    },
  });

  console.log(`✅ Demo prescription (${demoPrescription.code}) & delivery (${demoDelivery.requestCode}) seeded`);
  console.log("🎉 Seeding selesai dengan sukses!");
}

main()
  .catch((e) => {
    console.error("❌ Error saat seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
