import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio, ArrowRight } from "lucide-react";
import { PageHeader, cardCls, tableWrapCls, theadCls, rowCls } from "@/components/ui";
import prisma from "@/lib/prisma";
import ActionButton from "@/components/ActionButton";
import { retryOutboxAction } from "@/app/actions/integration";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi Monitoring - SIMRS Dummy" };

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/monitoring/active-deliveries",
    desc: "Pengantaran yang sedang berjalan beserta item obat, prioritas, alergi pasien, dan penanganan khusus (untuk robot/HMI).",
  },
  {
    method: "GET",
    path: "/api/v1/monitoring/stream",
    desc: "SSE perubahan status secara realtime (event: delivery, prescription).",
  },
  {
    method: "GET",
    path: "/api/v1/monitoring/snapshot?since=ISO-8601",
    desc: "SIMRS melempar data pasien, ruang + bed, dan pengantaran yang berubah sejak `since` ke website monitoring (polling).",
  },
  {
    method: "POST",
    path: "/api/v1/monitoring/delivery-status",
    desc: "Monitoring melempar status pengantaran obat ke SIMRS. Body: { requestCode, toStatus, note? }.",
  },
  {
    method: "GET",
    path: "/api/v1/monitoring/mapping",
    desc: "Peta sinkronisasi YAML live (bangsal, ruang, bed, status). Fetch berkala agar monitoring otomatis sesuai SIMRS.",
  },
];

export default async function IntegrasiPage() {
  const user = await getCurrentUser();

  const canView =
    user?.roles.includes("SYSTEM_ADMIN") ||
    user?.roles.includes("SIMRS_ADMIN");

  if (!canView) redirect("/dashboard");

  const tokenConfigured = !!process.env.MONITORING_TOKEN;
  const [counts, recent, oldestPending] = await Promise.all([
    prisma.outboxEvent.groupBy({ by: ["status"], _count: true }),
    prisma.outboxEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.outboxEvent.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const stale = oldestPending && Date.now() - oldestPending.createdAt.getTime() > 5 * 60_000;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Radio}
        iconCls="text-teal-700"
        title="Integrasi Monitoring"
        subtitle="Koneksi realtime SIMRS dengan website monitoring"
      />

      <div className={cardCls}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Status persiapan</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Token layanan (MONITORING_TOKEN)</dt>
            <dd className={tokenConfigured ? "font-medium text-emerald-700" : "font-medium text-rose-600"}>
              {tokenConfigured ? "Terkonfigurasi" : "Belum dikonfigurasi"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Akun audit layanan</dt>
            <dd className="font-mono text-xs text-slate-600">monitoring_service (via seed)</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Kontrak</dt>
            <dd className="font-mono text-xs text-slate-600">docs/api-contracts/monitoring-events.md</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Nilai token tidak pernah ditampilkan di sini. Kelola lewat file .env server.
        </p>
      </div>

      <section className={cardCls} aria-labelledby="h-outbox">
        <h2 id="h-outbox" className="text-base font-semibold text-slate-900">Pengiriman event ke backend</h2>
        <p className="mt-1 text-sm text-slate-500">
          Setiap perubahan status ditulis ke antrean (outbox) lalu dikirim ke backend oleh relay.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div><dt className="text-slate-500">Terkirim</dt><dd className="text-2xl font-semibold tabular-nums text-emerald-700">{n("SENT")}</dd></div>
          <div><dt className="text-slate-500">Menunggu</dt><dd className={`text-2xl font-semibold tabular-nums ${stale ? "text-rose-700" : "text-slate-900"}`}>{n("PENDING")}</dd></div>
          <div><dt className="text-slate-500">Gagal (DEAD)</dt><dd className={`text-2xl font-semibold tabular-nums ${n("DEAD") ? "text-rose-700" : "text-slate-900"}`}>{n("DEAD")}</dd></div>
        </dl>
        {stale && (
          <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ada event menunggu lebih dari 5 menit. Periksa relay (<code className="font-mono">simrs-relay</code>) dan URL/token callback.
          </p>
        )}
        {recent.length > 0 && (
          <div className={`${tableWrapCls} mt-4`}>
            <table className="w-full text-sm">
              <thead className={theadCls}>
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">Waktu</th>
                  <th scope="col" className="px-3 py-2 text-left">Tipe</th>
                  <th scope="col" className="px-3 py-2 text-left">Permintaan</th>
                  <th scope="col" className="px-3 py-2 text-left">Status</th>
                  <th scope="col" className="px-3 py-2 text-left">Percobaan</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((e) => (
                  <tr key={e.id} className={rowCls}>
                    <td className="px-3 py-2 text-slate-600">{new Date(e.createdAt).toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.type}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.requestCode}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${e.status === "SENT" ? "bg-emerald-100 text-emerald-800" : e.status === "DEAD" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{e.status}</span>
                      {e.lastError && <span className="ml-2 text-xs text-slate-500">{e.lastError}</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{e.attempts}</td>
                    <td className="px-3 py-2 text-right">
                      {e.status === "DEAD" && (
                        <ActionButton
                          action={retryOutboxAction.bind(null, e.id)}
                          ariaLabel={`Kirim ulang ${e.requestCode}`}
                          successMessage="Dijadwalkan kirim ulang"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Kirim ulang
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={cardCls}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Endpoint integrasi</h2>
        <div className="space-y-3">
          {ENDPOINTS.map((e) => (
            <div key={e.path} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">
                  {e.method}
                </span>
                <code className="font-mono text-xs text-teal-700">{e.path}</code>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{e.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Header wajib: <code className="font-mono">x-monitoring-token</code>. Contoh uji ada di kontrak.
        </p>
      </div>

      <div className={cardCls}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Contoh payload lemparan monitoring</h2>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
{`POST /api/v1/monitoring/delivery-status
{
  "requestCode": "DELIV-20261014-0001",
  "toStatus": "IN_TRANSIT",
  "note": "Robot berangkat dari farmasi"
}`}
        </pre>
        <Link
          href="/pengantaran"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline"
        >
          Lihat daftar pengantaran
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
