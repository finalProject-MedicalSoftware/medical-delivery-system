import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { FileText, Plus, Filter } from "lucide-react";
import { PrescriptionStatus } from "@prisma/client";
import {
  PageHeader,
  EmptyState,
  StatusBadge,
  CodeLink,
  btnPrimary,
  tableWrapCls,
  theadCls,
  rowCls,
} from "@/components/ui";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resep - SIMRS Dummy" };

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  VERIFIED: "Diverifikasi",
  REJECTED: "Ditolak",
  PREPARING: "Disiapkan",
  READY_FOR_DELIVERY: "Siap Kirim",
  CANCELLED: "Dibatalkan",
};

export default async function ResepPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { filter, page: pageRaw } = await searchParams;
  const user = await getCurrentUser();
  const page = Math.max(1, parseInt(pageRaw ?? "1") || 1);

  const statusFilter =
    filter && Object.keys(STATUS_LABELS).includes(filter)
      ? (filter as PrescriptionStatus)
      : undefined;

  const [prescriptions, total] = await Promise.all([
    prisma.prescription.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { fullName: true } },
        _count: { select: { items: true, deliveryRequests: true } },
      },
    }),
    prisma.prescription.count({
      where: statusFilter ? { status: statusFilter } : undefined,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("prescription:create");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        iconCls="text-teal-700"
        title="Resep Simulasi"
        subtitle={`${prescriptions.length} resep${statusFilter ? ` · filter: ${STATUS_LABELS[statusFilter]}` : ""}`}
        action={
          canCreate ? (
            <Link href="/resep/baru" id="btn-buat-resep" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Buat Resep
            </Link>
          ) : undefined
        }
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/resep"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
            !statusFilter
              ? "bg-teal-700 text-white"
              : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          <Filter className="h-3 w-3" />
          Semua
        </Link>
        {Object.entries(STATUS_LABELS).map(([s, l]) => (
          <Link
            key={s}
            href={`/resep?filter=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {l}
          </Link>
        ))}
      </div>

      {prescriptions.length === 0 ? (
        <EmptyState icon={FileText} message="Tidak ada resep" />
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 text-left">Kode</th>
                <th className="px-4 py-3 text-left">Pasien</th>
                <th className="px-4 py-3 text-left">Dokter</th>
                <th className="px-4 py-3 text-center">Item</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-left">Tanggal</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prescriptions.map((rx) => (
                <tr key={rx.id} className={rowCls}>
                  <td className="px-4 py-3">
                    <CodeLink href={`/resep/${rx.id}`}>{rx.code}</CodeLink>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{rx.patient.fullName}</div>
                    <div className="font-mono text-xs text-slate-400">{rx.patient.mrn}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">dr. {rx.doctor.fullName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {rx._count.items}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={rx.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(rx.createdAt).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/resep/${rx.id}`} className="text-xs font-medium text-teal-700 hover:underline">
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} />
    </div>
  );
}
