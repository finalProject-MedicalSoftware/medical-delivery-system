import { redirect } from "next/navigation";

// Tanpa halaman beranda pemasaran: SIMRS adalah alat kerja. Middleware/layout
// mengarahkan yang belum login ke /login.
export default function Home() {
  redirect("/dashboard");
}
