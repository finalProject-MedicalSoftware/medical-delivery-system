import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Truck, Plus, Info } from "lucide-react";
import { DeliveryStatus } from "@prisma/client";
import { DELIVERY_STATUS_LABELS as STATUS_LABELS } from "@/lib/delivery-status";
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
import { bedDisplayName } from "@/lib/bed-info";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengantaran - SIMRS Dummy" };

const PAGE_SIZE = 20;

export default async function PengantaranPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { filter, page: pageRaw } = await searchParams;
  const user = await getCurrentUser();
  const page = Math.max(1, parseInt(pageRaw ?? "1") || 1);

  const validStatuses = Object.keys(STATUS_LABELS) as DeliveryStatus[];
  const statusFilter =
    filter && validStatuses.includes(filter as DeliveryStatus)
      ? (filter as DeliveryStatus)
      : undefined;

  const [deliveries, total] = await Promise.all([
    prisma.deliveryRequest.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { requestedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        prescription: {
          select: {
            code: true,
            patient: { select: { bed: { select: { bedNumber: true } } } },
          },
        },
        requestedBy: { select: { fullName: true } },
      },
    }),
    prisma.deliveryRequest.count({
      where: statusFilter ? { status: statusFilter } : undefined,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canCreate =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("delivery:create");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Truck}
        iconCls="text-teal-700"
        title="Permintaan Pengantaran"
        subtitle="Status MOCK adalah simulasi - bukan pergerakan robot nyata"
        action={
          canCreate ? (
            <Link href="/pengantaran/baru" id="btn-ajukan-pengantaran" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Ajukan Pengantaran
            </Link>
          ) : undefined
        }
      />

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Status bertanda <strong>[MOCK]</strong> adalah simulasi di aplikasi ini.
          Pergerakan robot nyata dikontrol oleh Web Monitoring, bukan dari sini.
        </p>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/pengantaran"
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            !statusFilter
              ? "bg-teal-700 text-white"
              : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          Semua
        </Link>
        {validStatuses.map((s) => (
          <Link
            key={s}
            href={`/pengantaran?filter=${s}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {deliveries.length === 0 ? (
        <EmptyState icon={Truck} message="Tidak ada pengantaran" />
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 text-left">Kode</th>
                <th className="px-4 py-3 text-left">Resep</th>
                <th className="px-4 py-3 text-left">Ruang Tujuan</th>
                <th className="px-4 py-3 text-left">Bed</th>
                <th className="px-4 py-3 text-left">Pemohon</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-left">Waktu</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d) => (
                <tr key={d.id} className={rowCls}>
                  <td className="px-4 py-3">
                    <CodeLink href={`/pengantaran/${d.id}`}>{d.requestCode}</CodeLink>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.prescription.code}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-teal-700">{d.roomCode}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                    {bedDisplayName(d.prescription.patient.bed?.bedNumber)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{d.requestedBy.fullName}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(d.requestedAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/pengantaran/${d.id}`} className="text-xs font-medium text-teal-700 hover:underline">
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
