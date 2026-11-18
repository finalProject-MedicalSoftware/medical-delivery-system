import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader, tableWrapCls, theadCls, rowCls } from "@/components/ui";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = { DISPENSE: "Disiapkan untuk resep", RESTOCK: "Penambahan stok", ADJUST: "Koreksi stok" };

export default async function RiwayatStokPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getCurrentUser())) notFound();
  const med = await prisma.medicine.findUnique({
    where: { id },
    include: { stockMovements: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!med) notFound();
  const ids = [...new Set(med.stockMovements.map((m) => m.actorId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];

  return (
    <div className="space-y-5">
      <Link href="/obat" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Katalog obat
      </Link>
      <PageHeader title={`Riwayat stok: ${med.name}`} subtitle={`Stok saat ini ${med.stock} ${med.unit} · ambang menipis ${med.minStock}`} />
      {med.stockMovements.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Belum ada pergerakan stok tercatat.</p>
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th scope="col" className="px-4 py-3 text-left">Waktu</th>
                <th scope="col" className="px-4 py-3 text-left">Keterangan</th>
                <th scope="col" className="px-4 py-3 text-right">Perubahan</th>
                <th scope="col" className="px-4 py-3 text-left">Petugas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {med.stockMovements.map((m) => (
                <tr key={m.id} className={rowCls}>
                  <td className="px-4 py-3 text-slate-600">{new Date(m.createdAt).toLocaleString("id-ID")}</td>
                  <td className="px-4 py-3">{REASON[m.reason] ?? m.reason}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${m.delta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{users.find((u) => u.id === m.actorId)?.fullName ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
