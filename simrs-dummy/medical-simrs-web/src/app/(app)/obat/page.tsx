import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Pill, Plus, Search, Pencil } from "lucide-react";
import { toggleMedicineAction } from "@/app/actions/medicines";
import ActionButton from "@/components/ActionButton";
import {
  PageHeader,
  EmptyState,
  btnPrimary,
  inputCls,
  tableWrapCls,
  theadCls,
  rowCls,
} from "@/components/ui";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";
export const metadata = { title: "Katalog Obat - SIMRS Dummy" };

const PAGE_SIZE = 20;

export default async function ObatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageRaw } = await searchParams;
  const user = await getCurrentUser();
  const page = Math.max(1, parseInt(pageRaw ?? "1") || 1);

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { code: { contains: q, mode: "insensitive" as const } },
          { category: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [medicines, total] = await Promise.all([
    prisma.medicine.findMany({
      where,
      orderBy: { name: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.medicine.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canManage =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("master:manage");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Pill}
        iconCls="text-teal-700"
        title="Katalog Obat"
        subtitle={`${medicines.length} obat ditemukan`}
        action={
          canManage ? (
            <Link href="/obat/baru" id="btn-tambah-obat" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Tambah Obat
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama, kode, atau kategori…"
          aria-label="Cari obat"
          className={`${inputCls} max-w-sm pl-9`}
        />
      </form>

      {medicines.length === 0 ? (
        <EmptyState icon={Pill} message="Tidak ada obat ditemukan" />
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 text-left">Kode</th>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Satuan</th>
                <th className="px-4 py-3 text-left">Kategori</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3 text-center">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Kelola</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {medicines.map((m) => (
                <tr key={m.id} className={rowCls}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-teal-700">{m.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                  <td className="px-4 py-3 text-slate-600">{m.unit}</td>
                  <td className="px-4 py-3 text-slate-600">{m.category}</td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`font-semibold ${
                        m.stock <= 10 ? "text-rose-600" : "text-slate-900"
                      }`}
                    >
                      {m.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {m.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/obat/${m.id}/edit`}
                          title="Ubah obat"
                          aria-label={`Ubah ${m.name}`}
                          className="rounded-md border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <ActionButton
                          action={toggleMedicineAction.bind(null, m.id)}
                          title={m.isActive ? "Nonaktifkan obat" : "Aktifkan obat"}
                          ariaLabel={m.isActive ? `Nonaktifkan ${m.name}` : `Aktifkan ${m.name}`}
                          successMessage={m.isActive ? "Obat dinonaktifkan" : "Obat diaktifkan"}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {m.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </ActionButton>
                      </div>
                    </td>
                  )}
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
