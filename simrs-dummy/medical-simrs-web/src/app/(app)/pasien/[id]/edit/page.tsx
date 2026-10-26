import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import { getRoomsWithBedAvailability, filterRoomsForDropdown } from "@/lib/bed-availability";
import PatientForm from "@/components/PatientForm";

export const metadata = { title: "Ubah Pasien - SIMRS Dummy" };

export default async function UbahPasienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const canEdit =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canEdit) redirect("/pasien");

  const [patient, allRooms] = await Promise.all([
    prisma.patient.findUnique({ where: { id } }),
    getRoomsWithBedAvailability(),
  ]);

  if (!patient) notFound();

  const rooms = filterRoomsForDropdown(allRooms, patient.roomCode);

  return (
    <PatientForm
      rooms={rooms}
      initial={{
        id: patient.id,
        mrn: patient.mrn,
        fullName: patient.fullName,
        dateOfBirth: patient.dateOfBirth.toISOString().slice(0, 10),
        gender: patient.gender,
        roomCode: patient.roomCode,
        bedId: patient.bedId,
        notes: patient.notes,
        diagnosis: patient.diagnosis,
        isInfectious: patient.isInfectious,
      }}
    />
  );
}
