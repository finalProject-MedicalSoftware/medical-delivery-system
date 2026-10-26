import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import CreatePrescriptionForm from "@/components/CreatePrescriptionForm";

export const metadata = { title: "Buat Resep - SIMRS Dummy" };

export default async function BuatResepPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient: patientParam } = await searchParams;
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.PRESCRIPTION_CREATE);

  if (!canCreate) redirect("/resep");

  // Prefill dari detail pasien; abaikan bila pasien sudah keluar (riwayat)
  let initialPatientId: string | undefined;
  if (patientParam) {
    const prefetched = await prisma.patient.findUnique({
      where: { id: patientParam },
      select: { id: true, dischargedAt: true },
    });
    if (prefetched && !prefetched.dischargedAt) initialPatientId = prefetched.id;
  }

  const [patients, medicines] = await Promise.all([
    prisma.patient.findMany({
      where: { dischargedAt: null },
      orderBy: { fullName: "asc" },
      include: { bed: { select: { bedNumber: true } } },
    }),
    prisma.medicine.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return <CreatePrescriptionForm patients={patients} medicines={medicines} initialPatientId={initialPatientId} />;
}
