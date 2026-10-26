import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import MedicineForm from "@/components/MedicineForm";

export const metadata = { title: "Ubah Obat - SIMRS Dummy" };

export default async function UbahObatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const canEdit =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canEdit) redirect("/obat");

  const medicine = await prisma.medicine.findUnique({ where: { id } });
  if (!medicine) notFound();

  return (
    <MedicineForm
      initial={{
        id: medicine.id,
        code: medicine.code,
        name: medicine.name,
        unit: medicine.unit,
        category: medicine.category,
        stock: medicine.stock,
      }}
    />
  );
}
