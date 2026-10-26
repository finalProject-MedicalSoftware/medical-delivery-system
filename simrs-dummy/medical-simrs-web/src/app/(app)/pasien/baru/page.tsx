import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import { getRoomsWithBedAvailability, filterRoomsForDropdown } from "@/lib/bed-availability";
import PatientForm from "@/components/PatientForm";

export const metadata = { title: "Tambah Pasien - SIMRS Dummy" };

export default async function TambahPasienPage() {
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canCreate) redirect("/pasien");

  const rooms = filterRoomsForDropdown(await getRoomsWithBedAvailability(), null);

  return <PatientForm rooms={rooms} />;
}
