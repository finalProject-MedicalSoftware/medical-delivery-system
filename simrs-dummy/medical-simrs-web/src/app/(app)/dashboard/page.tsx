import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FileText, Truck, Users } from "lucide-react";
import Link from "next/link";
import { isLowStock } from "@/lib/clinical";
import { StatusBadge, PageHeader, btnPrimary, btnSecondary, cardCls } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [
    prescriptionsByStatus,
    deliveriesByStatus,
    recentPrescriptions,
    recentDeliveries,
    activeMedicines,
  ] = await Promise.all([
    prisma.prescription.groupBy({ by: ["status"], _count: true }),
    prisma.deliveryRequest.groupBy({ by: ["status"], _count: true }),
    prisma.prescription.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { select: { fullName: true, mrn: true } },
        doctor: { select: { fullName: true } },
      },
    }),
    prisma.deliveryRequest.findMany({
      take: 5,
      orderBy: { requestedAt: "desc" },
      include: {
        prescription: { select: { code: true } },
        requestedBy: { select: { fullName: true } },
      },
    }),
    prisma.medicine.findMany({ where: { isActive: true }, select: { id: true, name: true, stock: true, minStock: true, unit: true }, orderBy: { name: "asc" } }),
  ]);

  return {
    lowStock: activeMedicines.filter((m) => isLowStock(m.stock, m.minStock)),
    prescriptionsByStatus,
    deliveriesByStatus,
    recentPrescriptions,
    recentDeliveries,
  };
}

function Stat({ label, value, href, hint }: { label: string; value: number; href: string; hint: string }) {
  return (
    <Link href={href} className="group block px-5 py-4 transition-colors hover:bg-slate-50">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500 group-hover:text-teal-700">{hint}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await getDashboardData();

  const rx = Object.fromEntries(data.prescriptionsByStatus.map((r) => [r.status, r._count]));
  const del = Object.fromEntries(data.deliveriesByStatus.map((r) => [r.status, r._count]));
  const can = (perm: string) => user?.roles.includes("SYSTEM_ADMIN") || user?.permissions.includes(perm);

  // Alur kerja dari kiri ke kanan: jumlah item di tiap tahap saat ini.
  const tahap = [
    { label: "Menunggu verifikasi", n: rx["SUBMITTED"] ?? 0, href: "/resep?filter=SUBMITTED" },
    { label: "Disiapkan", n: (rx["VERIFIED"] ?? 0) + (rx["PREPARING"] ?? 0), href: "/resep" },
    { label: "Siap kirim", n: rx["READY_FOR_DELIVERY"] ?? 0, href: "/resep?filter=READY_FOR_DELIVERY" },
    { label: "Belum dikirim ke robot", n: del["DELIVERY_REQUESTED"] ?? 0, href: "/pengantaran" },
    { label: "Di robot / perjalanan", n: (del["PENDING_INTEGRATION"] ?? 0) + (del["IN_TRANSIT"] ?? 0), href: "/pengantaran" },
    { label: "Tiba, menunggu serah terima", n: del["ARRIVED_AT_ROOM"] ?? 0, href: "/pengantaran" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ringkasan layanan"
        subtitle={`Halo, ${user?.fullName}. Berikut kondisi resep dan pengantaran saat ini.`}
        action={
          <div className="flex flex-wrap gap-2">
            {can("prescription:create") && (
              <Link href="/resep/baru" className={btnPrimary}>
                <FileText className="h-4 w-4" />
                Buat resep
              </Link>
            )}
            {can("delivery:create") && (
              <Link href="/pengantaran/baru" className={btnSecondary}>
                <Truck className="h-4 w-4" />
                Ajukan pengantaran
              </Link>
            )}
            {can("master:manage") && (
              <Link href="/pasien/baru" className={btnSecondary}>
                <Users className="h-4 w-4" />
                Tambah pasien
              </Link>
            )}
          </div>
        }
      />

      <section aria-label="Alur layanan" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 xl:grid-cols-6 lg:divide-x">
          {tahap.map((t) => (
            <Stat key={t.label} label={t.label} value={t.n} href={t.href} hint="Buka daftar" />
          ))}
        </div>
      </section>

      {data.lowStock.length > 0 && can("prescription:prepare") && (
        <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="h-stok">
          <h2 id="h-stok" className="text-base font-semibold text-amber-900">Stok obat menipis ({data.lowStock.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-amber-900">
            {data.lowStock.map((m) => (
              <li key={m.id}>{m.name}: <span className="font-semibold tabular-nums">{m.stock}</span> {m.unit}</li>
            ))}
          </ul>
          <Link href="/obat" className="mt-3 inline-block text-sm font-medium text-amber-900 underline">Buka katalog obat</Link>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardCls} aria-labelledby="h-resep">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="h-resep" className="text-base font-semibold text-slate-900">Resep terbaru</h2>
            <Link href="/resep" className="text-sm font-medium text-teal-700 hover:underline">Semua resep</Link>
          </div>
          {data.recentPrescriptions.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">Belum ada resep. Resep yang dibuat dokter akan muncul di sini.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {data.recentPrescriptions.map((r) => (
                <li key={r.id}>
                  <Link href={`/resep/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{r.patient.fullName}</p>
                      <p className="truncate text-xs text-slate-500">
                        <span className="font-mono">{r.code}</span> · dr. {r.doctor.fullName}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardCls} aria-labelledby="h-antar">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="h-antar" className="text-base font-semibold text-slate-900">Pengantaran terbaru</h2>
            <Link href="/pengantaran" className="text-sm font-medium text-teal-700 hover:underline">Semua pengantaran</Link>
          </div>
          {data.recentDeliveries.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">Belum ada pengantaran. Ajukan dari resep yang berstatus siap kirim.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-slate-100">
              {data.recentDeliveries.map((d) => (
                <li key={d.id}>
                  <Link href={`/pengantaran/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium text-slate-900">{d.requestCode}</p>
                      <p className="truncate text-xs text-slate-500">Ruang {d.roomCode} · {d.requestedBy.fullName}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
