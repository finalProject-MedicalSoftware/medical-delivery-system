import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings, ShieldCheck } from "lucide-react";
import RoleManagement from "@/components/RoleManagement";
import {
  PageHeader,
  cardCls,
  tableWrapCls,
  theadCls,
  rowCls,
} from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengguna & Role - SIMRS Dummy" };

export default async function PenggunaPage() {
  const user = await getCurrentUser();

  const canManage =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.roles.includes("SIMRS_ADMIN");

  if (!canManage) redirect("/dashboard");

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        userRoles: { include: { role: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings}
        iconCls="text-slate-500"
        title="Pengguna & Penetapan Multi-Role"
        subtitle={`${users.length} pengguna · ${roles.length} role terdaftar`}
      />

      {/* Roles overview */}
      <div className={cardCls}>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          Daftar Role
        </h2>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <span key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
              <span className="font-mono font-semibold text-teal-700">{r.code}</span>
              <span className="ml-1.5 text-slate-500">- {r.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* User table with role management */}
      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead className={theadCls}>
            <tr>
              <th className="px-4 py-3 text-left">Pengguna</th>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={rowCls}>
                <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                <td className="px-4 py-3 font-mono text-xs text-teal-700">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {u.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RoleManagement
                    targetUserId={u.id}
                    currentRoles={u.userRoles.map((ur) => ur.role.code)}
                    allRoles={roles.map((r) => r.code)}
                    actorId={user!.userId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
