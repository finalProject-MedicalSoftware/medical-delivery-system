import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import RoomForm from "@/components/RoomForm";

export const metadata = { title: "Ubah Ruang - SIMRS Dummy" };

export default async function UbahRuangPage({
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

  const [room, wards] = await Promise.all([
    prisma.room.findUnique({ where: { id } }),
    prisma.ward.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (!room) notFound();

  return (
    <RoomForm
      wards={wards}
      initial={{ id: room.id, roomCode: room.roomCode, name: room.name, wardId: room.wardId }}
    />
  );
}
