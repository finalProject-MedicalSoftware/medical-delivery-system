import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import MedicineForm from "@/components/MedicineForm";

export const metadata = { title: "Tambah Obat - SIMRS Dummy" };

export default async function TambahObatPage() {
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canCreate) redirect("/obat");

  return <MedicineForm />;
}
