import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { loadReportRows, parseDays } from "@/lib/report-query";
import { toCsv } from "@/lib/report";

export const dynamic = "force-dynamic";

/** Ekspor CSV laporan pengantaran. Sesi login + izin delivery:read. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Belum login" }, { status: 401 });
  if (!hasPermission(user, "delivery:read")) return Response.json({ error: "Tidak berizin" }, { status: 403 });
  const days = parseDays(new URL(req.url).searchParams.get("days"));
  return new Response(toCsv(await loadReportRows(days)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-pengantaran-${days}hari.csv"`,
    },
  });
}
