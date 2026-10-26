import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PERMISSION_CODES } from "@/lib/rbac";
import WardForm from "@/components/WardForm";

export const metadata = { title: "Tambah Bangsal - SIMRS Dummy" };

export default async function TambahBangsalPage() {
  const user = await getCurrentUser();

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes(PERMISSION_CODES.MASTER_MANAGE);

  if (!canCreate) redirect("/bangsal");

  return <WardForm />;
}
