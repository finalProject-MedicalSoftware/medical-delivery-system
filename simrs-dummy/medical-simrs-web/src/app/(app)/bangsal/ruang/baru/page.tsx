import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import RoomForm from "@/components/RoomForm";

export const metadata = { title: "Tambah Ruang - SIMRS Dummy" };

export default async function TambahRuangPage({
  searchParams,
}: {
  searchParams: Promise<{ wardId?: string }>;
}) {
  const { wardId } = await searchParams;
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canCreate) redirect("/bangsal");

  const wards = await prisma.ward.findMany({ orderBy: { code: "asc" } });

  return <RoomForm wards={wards} presetWardId={wardId} />;
}
