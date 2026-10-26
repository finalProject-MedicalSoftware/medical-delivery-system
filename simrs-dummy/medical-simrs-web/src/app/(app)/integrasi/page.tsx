import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio, ArrowRight } from "lucide-react";
import { PageHeader, cardCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrasi Monitoring - SIMRS Dummy" };

const ENDPOINTS = [
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

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Radio}
        iconCls="text-teal-700"
        title="Integrasi Monitoring"
        subtitle="Persiapan mock koneksi realtime SIMRS dengan website monitoring - DRAF"
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

      <div className={cardCls}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Endpoint mock</h2>
        <div className="space-y-3">
          {ENDPOINTS.map((e) => (
            <div key={e.path} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
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
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
{`POST /api/v1/monitoring/delivery-status
{
  "requestCode": "DELIV-20261014-0001",
  "toStatus": "MOCK_IN_TRANSIT",
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
