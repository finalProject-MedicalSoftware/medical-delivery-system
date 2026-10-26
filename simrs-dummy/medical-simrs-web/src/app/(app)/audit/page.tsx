import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import {
  PageHeader,
  tableWrapCls,
  theadCls,
  rowCls,
  btnSecondary,
} from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Trail - SIMRS Dummy" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; page?: string }>;
}) {
  const user = await getCurrentUser();

  const canRead =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("audit:read");

  if (!canRead) redirect("/dashboard");

  const { entityType, page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1"));
  const pageSize = 30;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { actor: { select: { fullName: true, username: true } } },
    }),
    prisma.auditLog.count({ where: entityType ? { entityType } : undefined }),
  ]);

  const totalPages = Math.ceil(total / pageSize);
  const entityTypes = await prisma.auditLog.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        iconCls="text-teal-700"
        title="Audit Trail"
        subtitle={`${total} entri · Hanya append - tidak dapat diedit/dihapus`}
      />

      {/* Entity type filter */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/audit"
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            !entityType
              ? "bg-teal-700 text-white"
              : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          Semua
        </a>
        {entityTypes.map((e) => (
          <a
            key={e.entityType}
            href={`/audit?entityType=${e.entityType}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              entityType === e.entityType
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {e.entityType}
          </a>
        ))}
      </div>

      {/* Table */}
      <div className={tableWrapCls}>
        <table className="w-full text-xs">
          <thead className={theadCls}>
            <tr>
              <th className="px-4 py-3 text-left">Waktu</th>
              <th className="px-4 py-3 text-left">Aktor</th>
              <th className="px-4 py-3 text-left">Tipe Entitas</th>
              <th className="px-4 py-3 text-left">Aksi</th>
              <th className="px-4 py-3 text-left">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className={rowCls}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-500">
                  {new Date(log.createdAt).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">{log.actor.fullName}</div>
                  <div className="font-mono text-slate-400">{log.actor.username}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-slate-600">
                    {log.entityType}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-teal-700">{log.action}</td>
                <td className="max-w-xs truncate px-4 py-3 font-mono text-slate-400">
                  {log.details ? JSON.stringify(log.details).slice(0, 80) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <a
              href={`/audit?${entityType ? `entityType=${entityType}&` : ""}page=${page - 1}`}
              className={btnSecondary}
            >
              ← Sebelumnya
            </a>
          )}
          <span className="text-xs text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={`/audit?${entityType ? `entityType=${entityType}&` : ""}page=${page + 1}`}
              className={btnSecondary}
            >
              Berikutnya →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
