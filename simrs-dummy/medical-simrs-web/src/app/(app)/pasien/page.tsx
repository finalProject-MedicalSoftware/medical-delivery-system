import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Users, Plus, Search, Biohazard } from "lucide-react";
import Pagination from "@/components/Pagination";
import { getCareStatus, CARE_STATUS_LABEL } from "@/lib/care-status";
import {
  PageHeader,
  EmptyState,
  CodeLink,
  btnPrimary,
  inputCls,
  tableWrapCls,
  theadCls,
  rowCls,
} from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Pasien Sintetis - SIMRS Dummy",
};

const PAGE_SIZE = 20;

type CareStatus = "dirawat" | "riwayat" | "semua";

const TABS: { key: CareStatus; label: string }[] = [
  { key: "dirawat", label: "Dirawat" },
  { key: "riwayat", label: "Riwayat" },
  { key: "semua", label: "Semua" },
];

export default async function PasienPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status: statusRaw, page: pageRaw } = await searchParams;
  const user = await getCurrentUser();

  const status: CareStatus =
    statusRaw === "riwayat" || statusRaw === "semua" ? statusRaw : "dirawat";
  const page = Math.max(1, parseInt(pageRaw ?? "1") || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { mrn: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    // Dirawat berarti benar-benar rawat inap: belum selesai DAN punya ruang.
    // Pasien tanpa ruang (rawat jalan) tidak dihitung dirawat.
    ...(status === "dirawat"
      ? { dischargedAt: null, roomCode: { not: null } }
      : status === "riwayat"
        ? { dischargedAt: { not: null } }
        : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        _count: { select: { prescriptions: true } },
      },
    }),
    prisma.patient.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canManage =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.permissions.includes("master:manage");

  function tabHref(s: CareStatus) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (s !== "dirawat") p.set("status", s);
    const qs = p.toString();
    return qs ? `/pasien?${qs}` : "/pasien";
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Pasien Sintetis"
        subtitle={`${total} pasien - Data 100% sintetis/fiktif`}
        action={
          canManage ? (
            <Link href="/pasien/baru" id="btn-tambah-pasien" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Tambah Pasien
            </Link>
          ) : undefined
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status perawatan">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={status === t.key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              status === t.key
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form method="get" className="relative">
        {status !== "dirawat" && <input type="hidden" name="status" value={status} />}
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari nama atau MRN…"
          aria-label="Cari pasien"
          className={`${inputCls} max-w-sm pl-9`}
        />
      </form>

      {/* Table */}
      {patients.length === 0 ? (
        <EmptyState
          icon={Users}
          message={
            q
              ? `Tidak ada pasien dengan kata kunci "${q}"`
              : status === "riwayat"
                ? "Belum ada riwayat pasien keluar"
                : "Belum ada pasien terdaftar"
          }
        />
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className="px-4 py-3 text-left">MRN</th>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Ruang</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Resep</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p.id} className={rowCls}>
                  <td className="px-4 py-3 font-mono text-xs">
                    <CodeLink href={`/pasien/${p.id}`}>{p.mrn}</CodeLink>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {p.fullName}
                      {p.isInfectious && (
                        <span title="ALERT: penyakit menular">
                          <Biohazard className="h-3.5 w-3.5 text-rose-600" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {p.diagnosis ?? (p.gender === "L" ? "Laki-laki" : "Perempuan")}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.roomCode ?? "-"}</td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const care = getCareStatus(p);
                      return (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            care === "selesai"
                              ? "bg-slate-100 text-slate-500"
                              : care === "dirawat"
                                ? "bg-teal-700 text-white"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {CARE_STATUS_LABEL[care]}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {p._count.prescriptions}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/pasien/${p.id}`}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
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
