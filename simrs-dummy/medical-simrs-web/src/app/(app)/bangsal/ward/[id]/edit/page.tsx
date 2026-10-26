import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import WardForm from "@/components/WardForm";

export const metadata = { title: "Ubah Bangsal - SIMRS Dummy" };

export default async function UbahBangsalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const canEdit =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canEdit) redirect("/bangsal");

  const ward = await prisma.ward.findUnique({ where: { id } });
  if (!ward) notFound();

  return (
    <WardForm
      initial={{ id: ward.id, code: ward.code, name: ward.name, floor: ward.floor }}
    />
  );
}
