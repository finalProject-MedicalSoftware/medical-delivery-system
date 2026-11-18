import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PageHeader, cardCls, btnSecondary } from "@/components/ui";
import { loadReportRows, parseDays } from "@/lib/report-query";
import { summarizeDeliveries } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Laporan - SIMRS" };

const fmt = (m: number | null) => (m === null ? "-" : `${m.toFixed(1)} menit`);

export default async function LaporanPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "delivery:read")) redirect("/dashboard");
  const days = parseDays((await searchParams).days);
  const s = summarizeDeliveries(await loadReportRows(days));
  const max = Math.max(1, ...s.perDay.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan pengantaran"
        subtitle={`Ringkasan ${days} hari terakhir`}
        action={
          <a href={`/api/laporan?days=${days}`} className={btnSecondary}>Unduh CSV</a>
        }
      />
      <nav aria-label="Rentang waktu" className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <Link
            key={d}
            href={`/laporan?days=${d}`}
            aria-current={d === days ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${d === days ? "bg-teal-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"}`}
          >
            {d} hari
          </Link>
        ))}
      </nav>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <dl className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {[
            ["Total pengantaran", s.count],
            ["Selesai (serah terima)", s.completed],
            ["Dibatalkan", s.cancelled],
            ["Mendesak / STAT", `${s.urgent} / ${s.stat}`],
          ].map(([k, v]) => (
            <div key={k as string} className="px-5 py-4">
              <dt className="text-sm text-slate-500">{k}</dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardCls}>
          <h2 className="text-base font-semibold text-slate-900">Waktu rata-rata per tahap</h2>
          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            {[
              ["Diminta → berangkat", s.avgMinutes.waitingForRobot],
              ["Perjalanan ke ruangan", s.avgMinutes.travel],
              ["Tiba → serah terima", s.avgMinutes.waitingForHandover],
              ["Total sampai diterima", s.avgMinutes.endToEnd],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between py-2">
                <dt className="text-slate-600">{k}</dt>
                <dd className="font-medium tabular-nums text-slate-900">{fmt(v as number | null)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-slate-500">Hanya pengantaran yang melewati tahap tersebut yang dihitung.</p>
        </section>

        <section className={cardCls}>
          <h2 className="text-base font-semibold text-slate-900">Pengantaran per hari</h2>
          {s.perDay.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Belum ada pengantaran pada rentang ini.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {s.perDay.map(([day, n]) => (
                <li key={day} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 tabular-nums text-slate-600">{day}</span>
                  <span className="h-2 rounded-full bg-teal-600" style={{ width: `${(n / max) * 100}%`, minWidth: 4 }} />
                  <span className="tabular-nums text-slate-900">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
