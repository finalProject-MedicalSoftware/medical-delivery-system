import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  Users,
  ShieldCheck,
  Pill,
  BedDouble,
  FileText,
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  PackageCheck,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const [
    usersCount,
    patientsCount,
    roomsCount,
    medicinesCount,
    prescriptionsByStatus,
    deliveriesByStatus,
    recentPrescriptions,
    recentDeliveries,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.patient.count(),
    prisma.room.count(),
    prisma.medicine.count({ where: { isActive: true } }),
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
  ]);

  return {
    usersCount,
    patientsCount,
    roomsCount,
    medicinesCount,
    prescriptionsByStatus,
    deliveriesByStatus,
    recentPrescriptions,
    recentDeliveries,
  };
}

const RX_STATUSES = ["DRAFT", "SUBMITTED", "VERIFIED", "REJECTED", "PREPARING", "READY_FOR_DELIVERY", "CANCELLED"];
const DELIVERY_STATUSES = ["DELIVERY_REQUESTED", "PENDING_INTEGRATION", "MOCK_IN_TRANSIT", "MOCK_ARRIVED_AT_ROOM", "CANCELLED"];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await getDashboardData();

  const rxByStatus = Object.fromEntries(
    data.prescriptionsByStatus.map((r) => [r.status, r._count])
  );
  const delByStatus = Object.fromEntries(
    data.deliveriesByStatus.map((r) => [r.status, r._count])
  );

  const kpis = [
    { label: "Pengguna", val: data.usersCount, icon: Users, iconCls: "text-slate-500" },
    { label: "Pasien Sintetis", val: data.patientsCount, icon: Users, iconCls: "text-emerald-600" },
    { label: "Ruang Rawat", val: data.roomsCount, icon: BedDouble, iconCls: "text-amber-600" },
    { label: "Obat Aktif", val: data.medicinesCount, icon: Pill, iconCls: "text-rose-600" },
    { label: "Total Resep", val: data.prescriptionsByStatus.reduce((s, r) => s + r._count, 0), icon: FileText, iconCls: "text-sky-600" },
    { label: "Siap Kirim", val: rxByStatus["READY_FOR_DELIVERY"] ?? 0, icon: PackageCheck, iconCls: "text-teal-700" },
    { label: "Pengantaran", val: data.deliveriesByStatus.reduce((s, r) => s + r._count, 0), icon: Truck, iconCls: "text-teal-600" },
    { label: "Menunggu Integrasi", val: (delByStatus["PENDING_INTEGRATION"] ?? 0) + (delByStatus["DELIVERY_REQUESTED"] ?? 0), icon: AlertCircle, iconCls: "text-amber-600" },
  ];

  const quickActions = [
    { href: "/resep/baru", label: "Buat Resep", icon: FileText, perm: "prescription:create", tile: "hover:border-teal-600 hover:bg-teal-50", iconCls: "text-teal-700" },
    { href: "/resep?filter=SUBMITTED", label: "Antrean Farmasi", icon: ShieldCheck, perm: "prescription:verify", tile: "hover:border-sky-600 hover:bg-sky-50", iconCls: "text-sky-700" },
    { href: "/pengantaran/baru", label: "Ajukan Pengantaran", icon: Truck, perm: "delivery:create", tile: "hover:border-teal-600 hover:bg-teal-50", iconCls: "text-teal-700" },
    { href: "/pasien/baru", label: "Tambah Pasien", icon: Users, perm: "master:manage", tile: "hover:border-emerald-600 hover:bg-emerald-50", iconCls: "text-emerald-700" },
  ].filter(
    (a) =>
      user?.roles.includes("SYSTEM_ADMIN") ||
      user?.permissions.includes(a.perm)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Selamat datang, <span className="font-medium text-teal-700">{user?.fullName}</span> -{" "}
          {user?.roles.join(", ")}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{kpi.label}</span>
              <kpi.icon className={`h-4 w-4 ${kpi.iconCls}`} />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Prescriptions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Resep per Status</h2>
            <Link href="/resep" className="text-xs font-medium text-teal-700 hover:underline">
              Lihat semua →
            </Link>
          </div>
          <div className="space-y-2">
            {RX_STATUSES.map((s) =>
              (rxByStatus[s] ?? 0) > 0 ? (
                <div key={s} className="flex items-center justify-between">
                  <StatusBadge status={s} />
                  <span className="text-sm font-semibold text-slate-900">{rxByStatus[s]}</span>
                </div>
              ) : null
            )}
            {Object.keys(rxByStatus).length === 0 && (
              <p className="text-xs text-slate-400">Belum ada resep</p>
            )}
          </div>
        </div>

        {/* Deliveries */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Pengantaran per Status</h2>
            <Link href="/pengantaran" className="text-xs font-medium text-teal-700 hover:underline">
              Lihat semua →
            </Link>
          </div>
          <div className="space-y-2">
            {DELIVERY_STATUSES.map((s) =>
              (delByStatus[s] ?? 0) > 0 ? (
                <div key={s} className="flex items-center justify-between">
                  <StatusBadge status={s} />
                  <span className="text-sm font-semibold text-slate-900">{delByStatus[s]}</span>
                </div>
              ) : null
            )}
            {Object.keys(delByStatus).length === 0 && (
              <p className="text-xs text-slate-400">Belum ada permintaan pengantaran</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent prescriptions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Resep Terbaru</h2>
            <Link href="/resep" className="text-xs font-medium text-teal-700 hover:underline">Lihat semua →</Link>
          </div>
          {data.recentPrescriptions.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada resep</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentPrescriptions.map((rx) => (
                <li key={rx.id}>
                  <Link
                    href={`/resep/${rx.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-teal-700">{rx.code}</p>
                      <p className="text-xs text-slate-500">{rx.patient.fullName} · dr. {rx.doctor.fullName}</p>
                    </div>
                    <StatusBadge status={rx.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent deliveries */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Pengantaran Terbaru</h2>
            <Link href="/pengantaran" className="text-xs font-medium text-teal-700 hover:underline">Lihat semua →</Link>
          </div>
          {data.recentDeliveries.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada pengantaran</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentDeliveries.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/pengantaran/${d.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-teal-700">{d.requestCode}</p>
                      <p className="text-xs text-slate-500">Ruang: {d.roomCode} · {d.requestedBy.fullName}</p>
                    </div>
                    <StatusBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Role-access cards */}
      {quickActions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Akses Cepat</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition ${a.tile}`}
              >
                <a.icon className={`h-6 w-6 ${a.iconCls}`} />
                <span className="text-xs font-medium text-slate-700">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty-permission hint */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
        <p>
          Menu dan tombol aksi disesuaikan dengan peran Anda. Ikon{" "}
          <Clock className="inline h-3 w-3" /> menandai status menunggu,{" "}
          <CheckCircle2 className="inline h-3 w-3" /> selesai, dan{" "}
          <XCircle className="inline h-3 w-3" /> ditolak/dibatalkan.
        </p>
      </div>
    </div>
  );
}
