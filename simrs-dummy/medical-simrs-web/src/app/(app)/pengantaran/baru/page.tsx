import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import CreateDeliveryForm from "@/components/CreateDeliveryForm";
import { ACTIVE_DELIVERY_STATUSES } from "@/lib/delivery-status";

export const metadata = { title: "Ajukan Pengantaran - SIMRS Dummy" };

export default async function BuatPengantaranPage({
  searchParams,
}: {
  searchParams: Promise<{ prescription?: string }>;
}) {
  const { prescription: prescriptionParam } = await searchParams;
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.DELIVERY_CREATE);

  if (!canCreate) redirect("/pengantaran");

  const [readyPrescriptions, rooms] = await Promise.all([
    prisma.prescription.findMany({
      where: {
        status: "READY_FOR_DELIVERY",
        patient: { dischargedAt: null },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        patient: {
          select: {
            fullName: true,
            mrn: true,
            roomCode: true,
            bed: { select: { bedNumber: true } },
          },
        },
        deliveryRequests: {
          where: { status: { in: ACTIVE_DELIVERY_STATUSES } },
          select: { id: true },
        },
      },
    }),
    prisma.room.findMany({
      orderBy: { roomCode: "asc" },
      include: { ward: { select: { name: true } } },
    }),
  ]);

  // Prefill dari detail resep; abaikan bila tidak valid (bukan READY,
  // pasien keluar, atau sudah ada pengantaran aktif).
  let initialPrescriptionId: string | undefined;
  if (prescriptionParam) {
    const target = readyPrescriptions.find((r) => r.id === prescriptionParam);
    if (target && target.deliveryRequests.length === 0) {
      initialPrescriptionId = target.id;
    }
  }

  return (
    <CreateDeliveryForm
      readyPrescriptions={readyPrescriptions}
      rooms={rooms}
      initialPrescriptionId={initialPrescriptionId}
    />
  );
}
